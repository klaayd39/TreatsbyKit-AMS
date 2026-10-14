-- Orders, expenses, adjustments, manual journals, and owner administration.

create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_row jsonb := payload->'order';
  order_id uuid := coalesce(public.json_uuid(order_row->>'id'), gen_random_uuid());
  payment jsonb := payload->'payment';
  payment_id uuid;
  line jsonb;
  position integer := 0;
begin
  perform public.assert_role(array['owner', 'bookkeeper', 'cashier']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if exists (select 1 from public.orders where id = order_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('orders', 'payments', 'journalEntries'));
  end if;
  insert into public.orders (
    id, order_number, customer_id, order_date, fulfillment_date, fulfillment_type, notes, status,
    subtotal, discount_type, discount_value, discount_amount, total, is_demo
  ) values (
    order_id,
    coalesce(nullif(order_row->>'orderNumber', ''), public.next_document_number('OR', 4)),
    (order_row->>'customerId')::uuid,
    (order_row->>'orderDate')::date,
    (order_row->>'fulfillmentDate')::date,
    order_row->>'fulfillmentType',
    coalesce(order_row->>'notes', ''),
    'pending',
    round(coalesce((order_row->>'subtotal')::numeric, 0), 2),
    coalesce(nullif(order_row->>'discountType', ''), 'amount'),
    round(coalesce((order_row->>'discountValue')::numeric, 0), 2),
    round(coalesce((order_row->>'discountAmount')::numeric, 0), 2),
    round(coalesce((order_row->>'total')::numeric, 0), 2),
    public.payload_demo(payload)
  );
  for line in select value from jsonb_array_elements(coalesce(order_row->'lines', '[]'::jsonb))
  loop
    position := position + 1;
    insert into public.order_lines (id, order_id, item_id, quantity, unit_price, line_total, sort_order)
    values (
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), order_id, (line->>'itemId')::uuid,
      round((line->>'quantity')::numeric, 3), round(coalesce((line->>'unitPrice')::numeric, 0), 2),
      round(coalesce((line->>'lineTotal')::numeric, 0), 2), position
    );
  end loop;
  if payment is not null and payment <> 'null'::jsonb and coalesce((payment->>'amount')::numeric, 0) > 0 then
    payment_id := coalesce(public.json_uuid(payment->>'id'), gen_random_uuid());
    insert into public.sale_payments (
      id, sale_id, order_id, date, method, amount, tendered, change_due, kind, role, notes, is_demo
    ) values (
      payment_id, null, order_id, coalesce((payment->>'date')::date, (order_row->>'orderDate')::date),
      payment->>'method', round((payment->>'amount')::numeric, 2), round((payment->>'amount')::numeric, 2),
      0, 'payment', 'deposit', 'Down payment', public.payload_demo(payload)
    );
    if public.current_user_role() = 'cashier' or payload->'journal' is null or payload->'journal' = 'null'::jsonb then
      perform public.post_saved_payment_journal(payment_id);
    else
      perform public.insert_client_journal(payload->'journal');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', order_id, 'refresh', jsonb_build_array('orders', 'payments', 'journalEntries'));
end;
$$;

create or replace function public.complete_order(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_id uuid := public.json_uuid(payload->>'orderId');
  order_row record;
  sale_result jsonb;
  deposits numeric(14, 2);
  entry_id uuid;
  journal jsonb;
begin
  perform public.assert_role(array['owner', 'bookkeeper', 'cashier']);
  -- Client journal lines on the nested sale are checked for balance and lock only.
  select * into order_row from public.orders where id = order_id;
  if not found then
    raise exception 'order not found';
  end if;
  if order_row.status = 'cancelled' then
    raise exception 'a cancelled order cannot be completed';
  end if;
  if order_row.status = 'completed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('orders'));
  end if;
  sale_result := public.complete_sale(
    coalesce(payload->'salePayload', '{}'::jsonb) || jsonb_build_object('isDemo', public.payload_demo(payload))
  );
  update public.sale_payments
  set sale_id = public.json_uuid(sale_result->>'id')
  where order_id = complete_order.order_id and sale_id is null;
  select coalesce(sum(amount), 0) into deposits
  from public.sale_payments
  where order_id = complete_order.order_id and role = 'deposit' and amount > 0;
  if deposits > 0 then
    if public.current_user_role() = 'cashier' or payload->'depositJournal' is null or payload->'depositJournal' = 'null'::jsonb then
      perform public.post_deposit_application(order_id, (payload->>'date')::date);
    else
      journal := payload->'depositJournal';
      perform public.insert_client_journal(journal);
    end if;
  end if;
  update public.orders
  set status = 'completed', sale_id = public.json_uuid(sale_result->>'id')
  where id = order_id;
  return jsonb_build_object(
    'ok', true,
    'saleId', sale_result->>'id',
    'refresh', jsonb_build_array('orders', 'sales', 'payments', 'stockMovements', 'journalEntries')
  );
end;
$$;

create or replace function public.cancel_order(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_id uuid := public.json_uuid(payload->>'orderId');
  order_row record;
  paid numeric(14, 2);
  disposition text := nullif(payload->>'disposition', '');
  payment_id uuid;
  method text;
  entry_id uuid;
begin
  perform public.assert_role(array['owner', 'bookkeeper', 'cashier']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into order_row from public.orders where id = order_id;
  if not found then
    raise exception 'order not found';
  end if;
  if order_row.status in ('completed', 'cancelled') then
    raise exception 'this order cannot be cancelled';
  end if;
  select coalesce(sum(amount), 0) into paid from public.sale_payments where order_id = cancel_order.order_id;
  if paid > 0 and disposition not in ('refund', 'retain') then
    raise exception 'choose whether to refund the down payment or keep it';
  end if;
  if paid > 0 and disposition = 'refund' then
    select sale_payments.method into method
    from public.sale_payments where order_id = cancel_order.order_id and amount > 0
    order by created_at desc limit 1;
    payment_id := gen_random_uuid();
    insert into public.sale_payments (
      id, order_id, date, method, amount, tendered, change_due, kind, role, notes, is_demo
    ) values (
      payment_id, order_id, (payload->>'date')::date, coalesce(method, 'cash'), round(-paid, 2), round(paid, 2),
      0, 'refund', 'refund', coalesce(payload->>'reason', ''), order_row.is_demo
    );
  end if;
  if paid > 0 and (public.current_user_role() = 'cashier' or payload->'journal' is null or payload->'journal' = 'null'::jsonb) then
    perform public.post_deposit_close(order_id, (payload->>'date')::date, disposition, coalesce(method, 'cash'));
  elsif paid > 0 then
    perform public.insert_client_journal(payload->'journal');
  end if;
  update public.orders
  set status = 'cancelled',
      cancel_reason = coalesce(payload->>'reason', ''),
      cancelled_at = now(),
      down_payment_disposition = disposition
  where id = order_id;
  return jsonb_build_object('ok', true, 'refresh', jsonb_build_array('orders', 'payments', 'journalEntries'));
end;
$$;

create or replace function public.record_expense(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  expense jsonb := payload->'expense';
  expense_id uuid := coalesce(public.json_uuid(expense->>'id'), gen_random_uuid());
  journal jsonb;
  reversal uuid;
  existing record;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into existing from public.expenses where id = expense_id;
  if not found then
    insert into public.expenses (
      id, date, due_date, payee, category, description, amount, method, status, reference, notes, posting_revision, is_demo
    ) values (
      expense_id, (expense->>'date')::date, nullif(expense->>'dueDate', '')::date,
      btrim(expense->>'payee'), expense->>'category', coalesce(expense->>'description', ''),
      round((expense->>'amount')::numeric, 2), coalesce(nullif(expense->>'method', ''), 'cash'),
      expense->>'status', coalesce(expense->>'reference', ''), coalesce(expense->>'notes', ''),
      coalesce((expense->>'postingRevision')::integer, 1), public.payload_demo(payload)
    );
  else
    if existing.status = 'voided' then
      raise exception 'a voided expense cannot be edited';
    end if;
    update public.expenses
    set date = (expense->>'date')::date,
        due_date = nullif(expense->>'dueDate', '')::date,
        payee = btrim(expense->>'payee'),
        category = expense->>'category',
        description = coalesce(expense->>'description', ''),
        amount = round((expense->>'amount')::numeric, 2),
        method = coalesce(nullif(expense->>'method', ''), method),
        status = expense->>'status',
        reference = coalesce(expense->>'reference', ''),
        notes = coalesce(expense->>'notes', ''),
        posting_revision = coalesce((expense->>'postingRevision')::integer, posting_revision)
    where id = expense_id;
  end if;
  for journal in select value from jsonb_array_elements(coalesce(payload->'reversals', '[]'::jsonb))
  loop
    reversal := public.insert_client_journal(journal);
    perform public.mark_reversed(public.json_uuid(journal->>'reversalOfId'), reversal);
  end loop;
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', expense_id, 'refresh', jsonb_build_array('expenses', 'journalEntries'));
end;
$$;

create or replace function public.void_expense(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  expense_id uuid := public.json_uuid(payload->>'expenseId');
  journal jsonb;
  reversal uuid;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if not exists (select 1 from public.expenses where id = expense_id) then
    raise exception 'expense not found';
  end if;
  for journal in select value from jsonb_array_elements(coalesce(payload->'journals', '[]'::jsonb))
  loop
    reversal := public.insert_client_journal(journal);
    perform public.mark_reversed(public.json_uuid(journal->>'reversalOfId'), reversal);
  end loop;
  update public.expenses
  set status = 'voided', void_reason = coalesce(payload->>'reason', ''), voided_at = now()
  where id = expense_id;
  return jsonb_build_object('ok', true, 'refresh', jsonb_build_array('expenses', 'journalEntries'));
end;
$$;

create or replace function public.pay_expense(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  expense_id uuid := public.json_uuid(payload->>'expenseId');
  expense record;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into expense from public.expenses where id = expense_id;
  if not found then
    raise exception 'expense not found';
  end if;
  if expense.status <> 'unpaid' then
    raise exception 'this expense is not unpaid';
  end if;
  if round((payload->>'amount')::numeric, 2) <> expense.amount then
    raise exception 'pay the full unpaid amount';
  end if;
  perform public.insert_client_journal(payload->'journal');
  update public.expenses
  set status = 'paid', method = payload->>'method'
  where id = expense_id;
  return jsonb_build_object('ok', true, 'refresh', jsonb_build_array('expenses', 'journalEntries'));
end;
$$;

create or replace function public.create_stock_adjustment(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  movement jsonb := payload->'movement';
  movement_id uuid := coalesce(public.json_uuid(movement->>'id'), gen_random_uuid());
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  -- Adjustment is the only movement type allowed to take stock below zero.
  if exists (select 1 from public.stock_movements where id = movement_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('stockMovements', 'journalEntries'));
  end if;
  insert into public.stock_movements (
    id, date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
  ) values (
    movement_id, (movement->>'date')::date, (movement->>'itemId')::uuid, 'adjustment',
    round(coalesce((movement->>'quantityIn')::numeric, 0), 3),
    round(coalesce((movement->>'quantityOut')::numeric, 0), 3),
    round(coalesce((movement->>'unitCost')::numeric, 0), 4),
    'adjustment', null, coalesce(movement->>'notes', ''), public.payload_demo(payload)
  );
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', movement_id, 'refresh', jsonb_build_array('stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.post_manual_journal(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry_id uuid;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  entry_id := public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', entry_id, 'refresh', jsonb_build_array('journalEntries'));
end;
$$;

create or replace function public.reverse_journal_entry(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  original record;
  reversal uuid;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into original from public.journal_entries where id = public.json_uuid(payload->>'entryId');
  if not found then
    raise exception 'journal entry not found';
  end if;
  if original.source_type <> 'manual' then
    raise exception 'void or cancel the source record to reverse this entry';
  end if;
  if original.status = 'reversed' then
    raise exception 'this entry has already been reversed';
  end if;
  reversal := public.insert_client_journal(payload->'journal');
  perform public.mark_reversed(original.id, reversal);
  return jsonb_build_object('ok', true, 'id', reversal, 'refresh', jsonb_build_array('journalEntries'));
end;
$$;

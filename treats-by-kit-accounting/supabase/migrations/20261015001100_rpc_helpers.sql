-- Atomic business flows. The functions the app calls are security invoker, so
-- row level security still applies. finalize_sale and the small deposit helpers
-- are security definer only so a cashier can post cost of goods without being
-- able to read unit costs or the journal.

create or replace function public.json_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::uuid;
end;
$$;

create or replace function public.payload_demo(payload jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce((payload->>'isDemo')::boolean, false)
$$;

create or replace function public.assert_role(allowed text[])
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_active_user() or not (public.current_user_role() = any (allowed)) then
    raise exception 'not allowed';
  end if;
end;
$$;

create or replace function public.method_account(method text)
returns text
language sql
immutable
as $$
  select case method
    when 'gcash' then '1020'
    when 'bank_transfer' then '1030'
    else '1010'
  end
$$;

-- Journal lines in doc are supplied by the client. Balance, the lock date, and
-- event_key are enforced. The account on each line is not checked against the
-- business event.
create or replace function public.insert_client_journal(doc jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry_id uuid := coalesce(public.json_uuid(doc->>'id'), gen_random_uuid());
  wanted_key text := nullif(doc->>'eventKey', '');
  existing uuid;
  line jsonb;
  position integer := 0;
  kept integer := 0;
begin
  if doc is null or doc = 'null'::jsonb then
    return null;
  end if;
  if wanted_key is not null then
    select id into existing from public.journal_entries where event_key = wanted_key;
    if existing is not null then
      return existing;
    end if;
  end if;
  select count(*) into kept
  from jsonb_array_elements(coalesce(doc->'lines', '[]'::jsonb)) as line
  where coalesce((line.value->>'debit')::numeric, 0) > 0
     or coalesce((line.value->>'credit')::numeric, 0) > 0;
  if kept = 0 then
    return null;
  end if;
  insert into public.journal_entries (
    id, entry_number, date, description, source_type, source_id, event_key, status, reversal_of_id, is_demo
  ) values (
    entry_id,
    coalesce(nullif(doc->>'entryNumber', ''), public.next_document_number('JE', 4)),
    (doc->>'date')::date,
    btrim(coalesce(doc->>'description', '')),
    coalesce(nullif(doc->>'sourceType', ''), 'manual'),
    public.json_uuid(doc->>'sourceId'),
    wanted_key,
    'posted',
    public.json_uuid(doc->>'reversalOfId'),
    coalesce((doc->>'isDemo')::boolean, false)
  );
  for line in select value from jsonb_array_elements(doc->'lines')
  loop
    if coalesce((line->>'debit')::numeric, 0) = 0 and coalesce((line->>'credit')::numeric, 0) = 0 then
      continue;
    end if;
    position := position + 1;
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
    values (
      entry_id,
      (line->>'accountId')::uuid,
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'memo', ''),
      position
    );
  end loop;
  return entry_id;
end;
$$;

create or replace function public.mark_reversed(original_id uuid, reversal_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if original_id is null or reversal_id is null then
    return;
  end if;
  perform set_config('app.journal_reversal', 'on', true);
  update public.journal_entries
  set status = 'reversed', reversed_by_id = reversal_id
  where id = original_id and status <> 'reversed';
end;
$$;

-- Computes sale unit costs from the stock ledger and posts the cost journal.
-- When p_build_journals is true (cashier sales), it also posts the revenue and
-- payment journals from the sale row. It does not accept journal lines.
create or replace function public.finalize_sale(p_sale_id uuid, p_build_journals boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sale record;
  line record;
  payment record;
  unit_cost numeric(14, 4);
  line_cogs numeric(14, 2);
  total_cogs numeric(14, 2) := 0;
  entry_id uuid;
  position integer;
  cash_code text;
begin
  if public.current_user_role() not in ('owner', 'bookkeeper', 'cashier') or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  if exists (
    select 1 from public.stock_movements
    where reference_id = p_sale_id and reference_type = 'sale'
  ) then
    return;
  end if;
  select * into sale from public.sales where id = p_sale_id;
  if sale is null then
    raise exception 'sale not found';
  end if;
  if public.current_user_role() = 'cashier' and sale.created_by is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  for line in select * from public.sale_lines where sale_id = p_sale_id order by sort_order
  loop
    select case
      when coalesce(sum(stock_movements.quantity_in - stock_movements.quantity_out), 0) <= 0 then 0
      else round(
        sum((stock_movements.quantity_in - stock_movements.quantity_out) * stock_movements.unit_cost)
        / sum(stock_movements.quantity_in - stock_movements.quantity_out),
        4
      )
    end into unit_cost
    from public.stock_movements
    join public.items on items.id = stock_movements.item_id
    where stock_movements.item_id = line.item_id
      and stock_movements.type = case
        when items.category = 'finished_good' then 'production_output'
        else 'purchase'
      end;
    unit_cost := coalesce(unit_cost, 0);
    line_cogs := round(line.quantity * unit_cost, 2);
    total_cogs := total_cogs + line_cogs;
    update public.sale_lines
    set unit_cost = unit_cost,
        cogs = line_cogs,
        gross_profit = round(line.revenue - line_cogs, 2)
    where id = line.id;
    insert into public.stock_movements (
      date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
    ) values (
      sale.date, line.item_id, 'sale', 0, line.quantity, unit_cost, 'sale', sale.id, '', sale.is_demo
    );
  end loop;

  update public.sales
  set cogs_total = total_cogs,
      gross_profit = round(total - total_cogs, 2)
  where id = sale.id;

  if total_cogs > 0 then
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), sale.date,
      'Cost of goods sold ' || sale.sale_number, 'sale_cogs', sale.id,
      'sale-cogs:' || sale.id::text, 'posted', sale.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
    values
      (entry_id, (select id from public.accounts where code = '5010'), total_cogs, 0, sale.sale_number, 1),
      (entry_id, (select id from public.accounts where code = '1220'), 0, total_cogs, sale.sale_number, 2);
  end if;

  if not p_build_journals then
    return;
  end if;

  if sale.total > 0 or sale.discount_amount > 0 or sale.subtotal > 0 then
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), sale.date,
      'Sale ' || sale.sale_number, 'sale', sale.id, 'sale:' || sale.id::text, 'posted', sale.is_demo
    );
    position := 0;
    if sale.total > 0 then
      position := position + 1;
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (entry_id, (select id from public.accounts where code = '1100'), sale.total, 0, sale.sale_number, position);
    end if;
    if sale.discount_amount > 0 then
      position := position + 1;
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (entry_id, (select id from public.accounts where code = '4020'), sale.discount_amount, 0, sale.sale_number, position);
    end if;
    if sale.subtotal > 0 then
      position := position + 1;
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (entry_id, (select id from public.accounts where code = '4010'), 0, sale.subtotal, sale.sale_number, position);
    end if;
  end if;

  select * into payment from public.sale_payments
  where sale_id = sale.id and role = 'sale' and kind = 'payment' and amount > 0
  order by created_at desc limit 1;
  if found then
    cash_code := public.method_account(payment.method);
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), payment.date,
      'Customer payment ' || sale.sale_number, 'customer_payment', payment.id,
      'sale-payment:' || payment.id::text, 'posted', sale.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
    values
      (entry_id, (select id from public.accounts where code = cash_code), payment.amount, 0, sale.sale_number, 1),
      (entry_id, (select id from public.accounts where code = '1100'), 0, payment.amount, sale.sale_number, 2);
  end if;
end;
$$;

create or replace function public.post_saved_payment_journal(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment record;
  sale record;
  order_row record;
  entry_id uuid;
  amount numeric(14, 2);
  code text;
begin
  if public.current_user_role() not in ('owner', 'bookkeeper', 'cashier') or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  select * into payment from public.sale_payments where id = p_payment_id;
  if payment is null then
    raise exception 'payment not found';
  end if;
  if public.current_user_role() = 'cashier' and payment.created_by is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  code := public.method_account(payment.method);
  amount := abs(payment.amount);
  if payment.role = 'deposit' and payment.amount > 0 then
    select * into order_row from public.orders where id = payment.order_id;
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), payment.date,
      'Down payment ' || coalesce(order_row.order_number, ''), 'customer_deposit', payment.id,
      'order-deposit:' || payment.id::text, 'posted', payment.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
      (entry_id, (select id from public.accounts where code = code), amount, 0, coalesce(order_row.order_number, ''), 1),
      (entry_id, (select id from public.accounts where code = '2020'), 0, amount, coalesce(order_row.order_number, ''), 2);
  elsif payment.kind = 'refund' then
    select * into sale from public.sales where id = payment.sale_id;
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), payment.date,
      'Refund ' || coalesce(sale.sale_number, ''), 'customer_refund', payment.id,
      'sale-refund:' || payment.id::text, 'posted', payment.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
      (entry_id, (select id from public.accounts where code = '1100'), amount, 0, coalesce(sale.sale_number, ''), 1),
      (entry_id, (select id from public.accounts where code = code), 0, amount, coalesce(sale.sale_number, ''), 2);
  elsif payment.role = 'sale' and payment.amount > 0 then
    select * into sale from public.sales where id = payment.sale_id;
    entry_id := gen_random_uuid();
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), payment.date,
      'Customer payment ' || coalesce(sale.sale_number, ''), 'customer_payment', payment.id,
      'sale-payment:' || payment.id::text, 'posted', payment.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
      (entry_id, (select id from public.accounts where code = code), amount, 0, coalesce(sale.sale_number, ''), 1),
      (entry_id, (select id from public.accounts where code = '1100'), 0, amount, coalesce(sale.sale_number, ''), 2);
  end if;
end;
$$;

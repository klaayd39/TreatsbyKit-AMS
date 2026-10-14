-- One transaction per business flow. security invoker: the caller's RLS applies.
-- Where a function reads payload.journal, those lines come from the client.

create or replace function public.receive_items(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  receipt jsonb := payload->'receipt';
  receipt_id uuid := coalesce(public.json_uuid(receipt->>'id'), gen_random_uuid());
  line jsonb;
  invoice_line record;
  already numeric(14, 4);
  quantity numeric(14, 4);
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if exists (select 1 from public.receiving_records where id = receipt_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('receivingRecords', 'stockMovements', 'journalEntries'));
  end if;
  insert into public.receiving_records (id, invoice_id, date, is_demo)
  values (receipt_id, (receipt->>'invoiceId')::uuid, (receipt->>'date')::date, public.payload_demo(payload));
  for line in select value from jsonb_array_elements(coalesce(receipt->'lines', '[]'::jsonb))
  loop
    quantity := round((line->>'quantity')::numeric, 3);
    if quantity <= 0 then
      continue;
    end if;
    select * into invoice_line from public.purchase_invoice_lines where id = (line->>'invoiceLineId')::uuid;
    if not found then
      raise exception 'invoice line not found';
    end if;
    select coalesce(sum(receiving_lines.quantity), 0) into already
    from public.receiving_lines
    join public.receiving_records on receiving_records.id = receiving_lines.receipt_id
    where receiving_lines.invoice_line_id = invoice_line.id
      and receiving_records.id <> receipt_id;
    if already + quantity > invoice_line.quantity then
      raise exception 'receive quantity is more than the invoice line';
    end if;
    insert into public.receiving_lines (id, receipt_id, invoice_line_id, item_id, quantity)
    values (coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), receipt_id, invoice_line.id, invoice_line.item_id, quantity);
    insert into public.stock_movements (
      date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
    ) values (
      (receipt->>'date')::date, invoice_line.item_id, 'purchase', quantity, 0, invoice_line.unit_price,
      'receiving', receipt_id, '', public.payload_demo(payload)
    );
  end loop;
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', receipt_id, 'refresh', jsonb_build_array('receivingRecords', 'stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.record_supplier_payment(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  payment jsonb := payload->'payment';
  payment_id uuid := coalesce(public.json_uuid(payment->>'id'), gen_random_uuid());
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if exists (select 1 from public.supplier_payments where id = payment_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('supplierPayments', 'journalEntries'));
  end if;
  insert into public.supplier_payments (id, invoice_id, date, method, amount, reference, is_demo)
  values (
    payment_id, (payment->>'invoiceId')::uuid, (payment->>'date')::date, payment->>'method',
    round((payment->>'amount')::numeric, 2), coalesce(payment->>'reference', ''), public.payload_demo(payload)
  );
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', payment_id, 'refresh', jsonb_build_array('supplierPayments', 'journalEntries'));
end;
$$;

create or replace function public.complete_production_batch(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  batch jsonb := payload->'batch';
  batch_id uuid := coalesce(public.json_uuid(batch->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
  actual_qty numeric(14, 4);
  waste_qty numeric(14, 4);
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if exists (select 1 from public.production_batches where id = batch_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('productionBatches', 'stockMovements', 'journalEntries'));
  end if;
  insert into public.production_batches (
    id, batch_number, date, recipe_id, finished_item_id, quantity_produced, status, notes,
    labor_cost, overhead_cost, ingredient_cost, waste_cost, total_cost, cost_per_unit, is_demo
  ) values (
    batch_id,
    coalesce(nullif(batch->>'batchNumber', ''), public.next_document_number('B', 3)),
    (batch->>'date')::date,
    (batch->>'recipeId')::uuid,
    (batch->>'finishedItemId')::uuid,
    round((batch->>'quantityProduced')::numeric, 3),
    'completed',
    coalesce(batch->>'notes', ''),
    round(coalesce((batch->>'laborCost')::numeric, 0), 2),
    round(coalesce((batch->>'overheadCost')::numeric, 0), 2),
    round(coalesce((batch->>'ingredientCost')::numeric, 0), 2),
    round(coalesce((batch->>'wasteCost')::numeric, 0), 2),
    round(coalesce((batch->>'totalCost')::numeric, 0), 2),
    round(coalesce((batch->>'costPerUnit')::numeric, 0), 4),
    public.payload_demo(payload)
  );
  for line in select value from jsonb_array_elements(coalesce(batch->'lines', '[]'::jsonb))
  loop
    position := position + 1;
    actual_qty := round(coalesce((line->>'actualQty')::numeric, 0), 3);
    waste_qty := round(coalesce((line->>'wasteQty')::numeric, 0), 3);
    insert into public.production_batch_lines (
      id, batch_id, item_id, expected_qty, actual_qty, waste_qty, unit_cost, sort_order
    ) values (
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), batch_id, (line->>'itemId')::uuid,
      round(coalesce((line->>'expectedQty')::numeric, 0), 3), actual_qty, waste_qty,
      round(coalesce((line->>'unitCost')::numeric, 0), 4), position
    );
    if actual_qty > 0 then
      insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, is_demo)
      values ((batch->>'date')::date, (line->>'itemId')::uuid, 'production_use', 0, actual_qty, round(coalesce((line->>'unitCost')::numeric, 0), 4), 'production', batch_id, public.payload_demo(payload));
    end if;
    if waste_qty > 0 then
      insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo)
      values ((batch->>'date')::date, (line->>'itemId')::uuid, 'waste', 0, waste_qty, round(coalesce((line->>'unitCost')::numeric, 0), 4), 'production', batch_id, 'Waste', public.payload_demo(payload));
    end if;
  end loop;
  insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, is_demo)
  values (
    (batch->>'date')::date, (batch->>'finishedItemId')::uuid, 'production_output',
    round((batch->>'quantityProduced')::numeric, 3), 0, round(coalesce((batch->>'costPerUnit')::numeric, 0), 4),
    'production', batch_id, public.payload_demo(payload)
  );
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', batch_id, 'refresh', jsonb_build_array('productionBatches', 'stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.cancel_production_batch(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  batch_id uuid := public.json_uuid(payload->>'batchId');
  batch record;
  movement record;
  journal jsonb;
  reversal uuid;
  on_hand numeric(14, 4);
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into batch from public.production_batches where id = batch_id;
  if not found then
    raise exception 'batch not found';
  end if;
  if batch.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('productionBatches'));
  end if;
  select coalesce(sum(quantity_in - quantity_out), 0) into on_hand
  from public.stock_movements where item_id = batch.finished_item_id;
  if on_hand < batch.quantity_produced then
    raise exception 'negative stock';
  end if;
  for movement in
    select * from public.stock_movements
    where reference_id = batch_id and reference_type = 'production'
  loop
    insert into public.stock_movements (
      date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
    ) values (
      coalesce((payload->>'date')::date, current_date), movement.item_id, movement.type,
      movement.quantity_out, movement.quantity_in, movement.unit_cost, 'production_reversal', batch_id,
      coalesce(payload->>'reason', ''), batch.is_demo
    );
  end loop;
  for journal in select value from jsonb_array_elements(coalesce(payload->'journals', '[]'::jsonb))
  loop
    reversal := public.insert_client_journal(journal);
    perform public.mark_reversed(public.json_uuid(journal->>'reversalOfId'), reversal);
  end loop;
  update public.production_batches
  set status = 'cancelled',
      cancel_reason = coalesce(payload->>'reason', ''),
      cancelled_at = now()
  where id = batch_id;
  return jsonb_build_object('ok', true, 'refresh', jsonb_build_array('productionBatches', 'stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.complete_sale(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale jsonb := payload->'sale';
  sale_id uuid := coalesce(public.json_uuid(sale->>'id'), gen_random_uuid());
  payment jsonb := payload->'payment';
  payment_id uuid;
  line jsonb;
  position integer := 0;
  journal jsonb;
  build_journals boolean;
begin
  perform public.assert_role(array['owner', 'bookkeeper', 'cashier']);
  -- Client journal lines, when present, are checked for balance, lock, and event_key only.
  -- Cost of goods is always computed in the database from the stock ledger.
  if exists (select 1 from public.sales where id = sale_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'id', sale_id, 'refresh', jsonb_build_array('sales', 'salePayments', 'stockMovements', 'journalEntries'));
  end if;
  insert into public.sales (
    id, sale_number, date, sold_at, customer_id, source, order_id, subtotal, discount_type,
    discount_value, discount_amount, total, status, notes, is_demo
  ) values (
    sale_id,
    coalesce(nullif(sale->>'saleNumber', ''), public.next_document_number('SL', 4)),
    (sale->>'date')::date,
    coalesce((sale->>'soldAt')::timestamptz, (sale->>'date')::timestamptz),
    public.json_uuid(sale->>'customerId'),
    coalesce(nullif(sale->>'source', ''), 'pos'),
    public.json_uuid(sale->>'orderId'),
    round(coalesce((sale->>'subtotal')::numeric, 0), 2),
    coalesce(nullif(sale->>'discountType', ''), 'amount'),
    round(coalesce((sale->>'discountValue')::numeric, 0), 2),
    round(coalesce((sale->>'discountAmount')::numeric, 0), 2),
    round(coalesce((sale->>'total')::numeric, 0), 2),
    'completed',
    coalesce(sale->>'notes', ''),
    public.payload_demo(payload)
  );
  for line in select value from jsonb_array_elements(coalesce(sale->'lines', '[]'::jsonb))
  loop
    position := position + 1;
    insert into public.sale_lines (
      id, sale_id, item_id, quantity, unit_price, unit_cost, line_total, revenue, cogs, gross_profit, sort_order
    ) values (
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), sale_id, (line->>'itemId')::uuid,
      round((line->>'quantity')::numeric, 3), round(coalesce((line->>'unitPrice')::numeric, 0), 2), 0,
      round(coalesce((line->>'lineTotal')::numeric, 0), 2), round(coalesce((line->>'revenue')::numeric, 0), 2),
      0, 0, position
    );
  end loop;
  if payment is not null and payment <> 'null'::jsonb and coalesce((payment->>'amount')::numeric, 0) > 0 then
    payment_id := coalesce(public.json_uuid(payment->>'id'), gen_random_uuid());
    insert into public.sale_payments (
      id, sale_id, order_id, date, method, amount, tendered, change_due, kind, role, notes, is_demo
    ) values (
      payment_id, sale_id, public.json_uuid(sale->>'orderId'),
      coalesce((payment->>'date')::date, (sale->>'date')::date), payment->>'method',
      round((payment->>'amount')::numeric, 2), round(coalesce((payment->>'tendered')::numeric, (payment->>'amount')::numeric), 2),
      round(coalesce((payment->>'changeDue')::numeric, 0), 2), 'payment', 'sale', '', public.payload_demo(payload)
    );
  end if;
  build_journals := public.current_user_role() = 'cashier' or payload->'journals' is null or payload->'journals' = 'null'::jsonb;
  if not build_journals then
    for journal in select value from jsonb_array_elements(payload->'journals')
    loop
      if coalesce(journal->>'sourceType', '') = 'sale_cogs' then
        continue;
      end if;
      perform public.insert_client_journal(journal);
    end loop;
  end if;
  perform public.finalize_sale(sale_id, build_journals);
  return jsonb_build_object('ok', true, 'id', sale_id, 'paymentId', payment_id, 'refresh', jsonb_build_array('sales', 'payments', 'stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.record_sale_payment(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  payment jsonb := payload->'payment';
  payment_id uuid := coalesce(public.json_uuid(payment->>'id'), gen_random_uuid());
begin
  perform public.assert_role(array['owner', 'bookkeeper', 'cashier']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  if exists (select 1 from public.sale_payments where id = payment_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('payments', 'journalEntries'));
  end if;
  insert into public.sale_payments (
    id, sale_id, order_id, date, method, amount, tendered, change_due, kind, role, notes, is_demo
  ) values (
    payment_id, public.json_uuid(payment->>'saleId'), public.json_uuid(payment->>'orderId'),
    (payment->>'date')::date, payment->>'method', round((payment->>'amount')::numeric, 2),
    round(coalesce((payment->>'tendered')::numeric, abs((payment->>'amount')::numeric)), 2),
    round(coalesce((payment->>'changeDue')::numeric, 0), 2),
    coalesce(nullif(payment->>'kind', ''), 'payment'),
    coalesce(nullif(payment->>'role', ''), 'sale'),
    coalesce(payment->>'notes', ''), public.payload_demo(payload)
  );
  if public.current_user_role() = 'cashier' or payload->'journal' is null or payload->'journal' = 'null'::jsonb then
    perform public.post_saved_payment_journal(payment_id);
  else
    perform public.insert_client_journal(payload->'journal');
  end if;
  return jsonb_build_object('ok', true, 'id', payment_id, 'refresh', jsonb_build_array('payments', 'journalEntries'));
end;
$$;

create or replace function public.void_sale(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_id uuid := public.json_uuid(payload->>'saleId');
  sale record;
  movement record;
  journal jsonb;
  reversal uuid;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  -- Client journal lines: balance, lock, and event_key are checked; account choice is not.
  select * into sale from public.sales where id = sale_id;
  if not found then
    raise exception 'sale not found';
  end if;
  if sale.status = 'voided' then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('sales'));
  end if;
  for movement in
    select * from public.stock_movements where reference_id = sale_id and reference_type = 'sale'
  loop
    insert into public.stock_movements (
      date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
    ) values (
      coalesce((payload->>'date')::date, sale.date), movement.item_id, 'sale',
      movement.quantity_out, movement.quantity_in, movement.unit_cost, 'sale_reversal', sale_id,
      coalesce(payload->>'reason', ''), sale.is_demo
    );
  end loop;
  for journal in select value from jsonb_array_elements(coalesce(payload->'journals', '[]'::jsonb))
  loop
    reversal := public.insert_client_journal(journal);
    perform public.mark_reversed(public.json_uuid(journal->>'reversalOfId'), reversal);
  end loop;
  update public.sales
  set status = 'voided', void_reason = coalesce(payload->>'reason', ''), voided_at = now()
  where id = sale_id;
  return jsonb_build_object('ok', true, 'refresh', jsonb_build_array('sales', 'stockMovements', 'journalEntries'));
end;
$$;

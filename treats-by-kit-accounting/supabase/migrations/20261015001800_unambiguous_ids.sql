-- PL/pgSQL variables named invoice_id, receipt_id, recipe_id, and batch_id
-- clash with those columns and raise "column reference is ambiguous".

create or replace function public.save_purchase_invoice(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice jsonb := payload->'invoice';
  target_id uuid := coalesce(public.json_uuid(invoice->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
  locked boolean;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  locked := exists (
    select 1 from public.receiving_records
    where receiving_records.invoice_id = target_id
  );
  if exists (select 1 from public.purchase_invoices where id = target_id) then
    update public.purchase_invoices
    set invoice_date = (invoice->>'invoiceDate')::date,
        due_date = nullif(invoice->>'dueDate', '')::date,
        payment_terms = coalesce(invoice->>'paymentTerms', ''),
        notes = coalesce(invoice->>'notes', '')
    where id = target_id;
    if not locked then
      update public.purchase_invoices
      set supplier_id = (invoice->>'supplierId')::uuid,
          invoice_number = btrim(invoice->>'invoiceNumber')
      where id = target_id;
      delete from public.purchase_invoice_lines
      where purchase_invoice_lines.invoice_id = target_id;
    end if;
  else
    insert into public.purchase_invoices (
      id, supplier_id, invoice_number, invoice_date, due_date, payment_terms, notes, is_demo
    ) values (
      target_id, (invoice->>'supplierId')::uuid, btrim(invoice->>'invoiceNumber'),
      (invoice->>'invoiceDate')::date, nullif(invoice->>'dueDate', '')::date,
      coalesce(invoice->>'paymentTerms', ''), coalesce(invoice->>'notes', ''), public.payload_demo(payload)
    );
  end if;
  if not locked then
    for line in select value from jsonb_array_elements(coalesce(invoice->'lines', '[]'::jsonb))
    loop
      position := position + 1;
      insert into public.purchase_invoice_lines (id, invoice_id, item_id, quantity, unit_price, sort_order)
      values (
        coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), target_id, (line->>'itemId')::uuid,
        round((line->>'quantity')::numeric, 3), round((line->>'unitPrice')::numeric, 2), position
      );
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', target_id, 'refresh', jsonb_build_array('purchaseInvoices'));
end;
$$;

create or replace function public.receive_items(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  receipt jsonb := payload->'receipt';
  target_id uuid := coalesce(public.json_uuid(receipt->>'id'), gen_random_uuid());
  line jsonb;
  invoice_line record;
  already numeric(14, 4);
  quantity numeric(14, 4);
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  if exists (select 1 from public.receiving_records where id = target_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('receivingRecords', 'stockMovements', 'journalEntries'));
  end if;
  insert into public.receiving_records (id, invoice_id, date, is_demo)
  values (target_id, (receipt->>'invoiceId')::uuid, (receipt->>'date')::date, public.payload_demo(payload));
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
      and receiving_records.id <> target_id;
    if already + quantity > invoice_line.quantity then
      raise exception 'receive quantity is more than the invoice line';
    end if;
    insert into public.receiving_lines (id, receipt_id, invoice_line_id, item_id, quantity)
    values (coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), target_id, invoice_line.id, invoice_line.item_id, quantity);
    insert into public.stock_movements (
      date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo
    ) values (
      (receipt->>'date')::date, invoice_line.item_id, 'purchase', quantity, 0, invoice_line.unit_price,
      'receiving', target_id, '', public.payload_demo(payload)
    );
  end loop;
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', target_id, 'refresh', jsonb_build_array('receivingRecords', 'stockMovements', 'journalEntries'));
end;
$$;

create or replace function public.save_recipe(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  recipe jsonb := payload->'recipe';
  target_id uuid := coalesce(public.json_uuid(recipe->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  if exists (select 1 from public.recipes where id = target_id) then
    update public.recipes
    set name = btrim(recipe->>'name'),
        finished_item_id = (recipe->>'finishedItemId')::uuid,
        yield_quantity = round((recipe->>'yieldQuantity')::numeric, 3),
        notes = coalesce(recipe->>'notes', '')
    where id = target_id;
    delete from public.recipe_lines
    where recipe_lines.recipe_id = target_id;
  else
    insert into public.recipes (id, name, finished_item_id, yield_quantity, notes, is_demo)
    values (
      target_id, btrim(recipe->>'name'), (recipe->>'finishedItemId')::uuid,
      round((recipe->>'yieldQuantity')::numeric, 3), coalesce(recipe->>'notes', ''), public.payload_demo(payload)
    );
  end if;
  for line in select value from jsonb_array_elements(coalesce(recipe->'ingredients', '[]'::jsonb))
  loop
    position := position + 1;
    insert into public.recipe_lines (id, recipe_id, item_id, quantity, sort_order)
    values (
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), target_id, (line->>'itemId')::uuid,
      round((line->>'quantity')::numeric, 3), position
    );
  end loop;
  return jsonb_build_object('ok', true, 'id', target_id, 'refresh', jsonb_build_array('recipes'));
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
  target_id uuid := coalesce(public.json_uuid(batch->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
  actual_qty numeric(14, 4);
  waste_qty numeric(14, 4);
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  if exists (select 1 from public.production_batches where id = target_id) then
    return jsonb_build_object('ok', true, 'skipped', true, 'refresh', jsonb_build_array('productionBatches', 'stockMovements', 'journalEntries'));
  end if;
  insert into public.production_batches (
    id, batch_number, date, recipe_id, finished_item_id, quantity_produced, status, notes,
    labor_cost, overhead_cost, ingredient_cost, waste_cost, total_cost, cost_per_unit, is_demo
  ) values (
    target_id,
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
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), target_id, (line->>'itemId')::uuid,
      round(coalesce((line->>'expectedQty')::numeric, 0), 3), actual_qty, waste_qty,
      round(coalesce((line->>'unitCost')::numeric, 0), 4), position
    );
    if actual_qty > 0 then
      insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, is_demo)
      values ((batch->>'date')::date, (line->>'itemId')::uuid, 'production_use', 0, actual_qty, round(coalesce((line->>'unitCost')::numeric, 0), 4), 'production', target_id, public.payload_demo(payload));
    end if;
    if waste_qty > 0 then
      insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, notes, is_demo)
      values ((batch->>'date')::date, (line->>'itemId')::uuid, 'waste', 0, waste_qty, round(coalesce((line->>'unitCost')::numeric, 0), 4), 'production', target_id, 'Waste', public.payload_demo(payload));
    end if;
  end loop;
  insert into public.stock_movements (date, item_id, type, quantity_in, quantity_out, unit_cost, reference_type, reference_id, is_demo)
  values (
    (batch->>'date')::date, (batch->>'finishedItemId')::uuid, 'production_output',
    round((batch->>'quantityProduced')::numeric, 3), 0, round(coalesce((batch->>'costPerUnit')::numeric, 0), 4),
    'production', target_id, public.payload_demo(payload)
  );
  perform public.insert_client_journal(payload->'journal');
  return jsonb_build_object('ok', true, 'id', target_id, 'refresh', jsonb_build_array('productionBatches', 'stockMovements', 'journalEntries'));
end;
$$;

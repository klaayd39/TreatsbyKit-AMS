-- Deposit journals for cashiers, document saves, and owner administration.
-- Deposit helpers build the journal themselves so a cashier never supplies accounts.

create or replace function public.post_deposit_application(p_order_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row record;
  deposits numeric(14, 2);
  entry_id uuid := gen_random_uuid();
begin
  if public.current_user_role() not in ('owner', 'bookkeeper', 'cashier') or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from public.journal_entries where event_key = 'order-deposit-apply:' || p_order_id::text) then
    return;
  end if;
  select * into order_row from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  select coalesce(sum(amount), 0) into deposits
  from public.sale_payments
  where order_id = p_order_id and role = 'deposit' and amount > 0;
  if deposits <= 0 then
    return;
  end if;
  insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
  values (
    entry_id, public.next_document_number('JE', 4), p_date,
    'Apply deposit ' || order_row.order_number, 'deposit_applied', p_order_id,
    'order-deposit-apply:' || p_order_id::text, 'posted', order_row.is_demo
  );
  insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
    (entry_id, (select id from public.accounts where code = '2020'), deposits, 0, order_row.order_number, 1),
    (entry_id, (select id from public.accounts where code = '1100'), 0, deposits, order_row.order_number, 2);
end;
$$;

create or replace function public.post_deposit_close(p_order_id uuid, p_date date, p_disposition text, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row record;
  paid numeric(14, 2);
  entry_id uuid := gen_random_uuid();
begin
  if public.current_user_role() not in ('owner', 'bookkeeper', 'cashier') or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  select * into order_row from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  select coalesce(sum(amount), 0) into paid from public.sale_payments where order_id = p_order_id;
  if paid <= 0 then
    return;
  end if;
  if p_disposition = 'refund' then
    if exists (select 1 from public.journal_entries where event_key = 'order-deposit-refund:' || p_order_id::text) then
      return;
    end if;
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), p_date,
      'Refund deposit ' || order_row.order_number, 'deposit_refund', p_order_id,
      'order-deposit-refund:' || p_order_id::text, 'posted', order_row.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
      (entry_id, (select id from public.accounts where code = '2020'), paid, 0, order_row.order_number, 1),
      (entry_id, (select id from public.accounts where code = public.method_account(p_method)), 0, paid, order_row.order_number, 2);
  elsif p_disposition = 'retain' then
    if exists (select 1 from public.journal_entries where event_key = 'order-deposit-retain:' || p_order_id::text) then
      return;
    end if;
    insert into public.journal_entries (id, entry_number, date, description, source_type, source_id, event_key, status, is_demo)
    values (
      entry_id, public.next_document_number('JE', 4), p_date,
      'Retain deposit ' || order_row.order_number, 'deposit_retained', p_order_id,
      'order-deposit-retain:' || p_order_id::text, 'posted', order_row.is_demo
    );
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, sort_order) values
      (entry_id, (select id from public.accounts where code = '2020'), paid, 0, order_row.order_number, 1),
      (entry_id, (select id from public.accounts where code = '4090'), 0, paid, order_row.order_number, 2);
  end if;
end;
$$;

create or replace function public.save_purchase_invoice(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice jsonb := payload->'invoice';
  invoice_id uuid := coalesce(public.json_uuid(invoice->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
  locked boolean;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  locked := exists (select 1 from public.receiving_records where invoice_id = save_purchase_invoice.invoice_id);
  if exists (select 1 from public.purchase_invoices where id = invoice_id) then
    update public.purchase_invoices
    set invoice_date = (invoice->>'invoiceDate')::date,
        due_date = nullif(invoice->>'dueDate', '')::date,
        payment_terms = coalesce(invoice->>'paymentTerms', ''),
        notes = coalesce(invoice->>'notes', '')
    where id = invoice_id;
    if not locked then
      update public.purchase_invoices
      set supplier_id = (invoice->>'supplierId')::uuid,
          invoice_number = btrim(invoice->>'invoiceNumber')
      where id = invoice_id;
      delete from public.purchase_invoice_lines where invoice_id = save_purchase_invoice.invoice_id;
    end if;
  else
    insert into public.purchase_invoices (
      id, supplier_id, invoice_number, invoice_date, due_date, payment_terms, notes, is_demo
    ) values (
      invoice_id, (invoice->>'supplierId')::uuid, btrim(invoice->>'invoiceNumber'),
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
        coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), invoice_id, (line->>'itemId')::uuid,
        round((line->>'quantity')::numeric, 3), round((line->>'unitPrice')::numeric, 2), position
      );
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', invoice_id, 'refresh', jsonb_build_array('purchaseInvoices'));
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
  recipe_id uuid := coalesce(public.json_uuid(recipe->>'id'), gen_random_uuid());
  line jsonb;
  position integer := 0;
begin
  perform public.assert_role(array['owner', 'bookkeeper']);
  if exists (select 1 from public.recipes where id = recipe_id) then
    update public.recipes
    set name = btrim(recipe->>'name'),
        finished_item_id = (recipe->>'finishedItemId')::uuid,
        yield_quantity = round((recipe->>'yieldQuantity')::numeric, 3),
        notes = coalesce(recipe->>'notes', '')
    where id = recipe_id;
    delete from public.recipe_lines where recipe_id = save_recipe.recipe_id;
  else
    insert into public.recipes (id, name, finished_item_id, yield_quantity, notes, is_demo)
    values (
      recipe_id, btrim(recipe->>'name'), (recipe->>'finishedItemId')::uuid,
      round((recipe->>'yieldQuantity')::numeric, 3), coalesce(recipe->>'notes', ''), public.payload_demo(payload)
    );
  end if;
  for line in select value from jsonb_array_elements(coalesce(recipe->'ingredients', '[]'::jsonb))
  loop
    position := position + 1;
    insert into public.recipe_lines (id, recipe_id, item_id, quantity, sort_order)
    values (
      coalesce(public.json_uuid(line->>'id'), gen_random_uuid()), recipe_id, (line->>'itemId')::uuid,
      round((line->>'quantity')::numeric, 3), position
    );
  end loop;
  return jsonb_build_object('ok', true, 'id', recipe_id, 'refresh', jsonb_build_array('recipes'));
end;
$$;

create or replace function public.list_employees()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  active boolean,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'owner' or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.email, profiles.role, profiles.active, users.last_sign_in_at
  from public.profiles
  join auth.users on users.id = profiles.id
  order by profiles.full_name, profiles.email;
end;
$$;

create or replace function public.set_user_access(p_user_id uuid, p_role text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owners integer;
begin
  if public.current_user_role() <> 'owner' or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  if p_role not in ('owner', 'bookkeeper', 'cashier', 'viewer') then
    raise exception 'unknown role';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'owner' or p_active = false) then
    raise exception 'You cannot change your own access.';
  end if;
  select count(*) into owners from public.profiles where role = 'owner' and active and id <> p_user_id;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'owner' and active)
     and (p_role <> 'owner' or p_active = false)
     and owners = 0 then
    raise exception 'The business needs one active owner.';
  end if;
  update public.profiles set role = p_role, active = p_active where id = p_user_id;
end;
$$;

create or replace function public.remove_demo_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked date;
begin
  if public.current_user_role() <> 'owner' or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  select books_locked_through into locked from public.business_settings limit 1;
  if locked is not null then
    raise exception 'demo data cannot be removed while the books are locked';
  end if;
  perform set_config('app.allow_demo_purge', 'on', true);
  delete from public.journal_lines where entry_id in (select id from public.journal_entries where is_demo);
  delete from public.journal_entries where is_demo;
  delete from public.stock_movements where is_demo;
  delete from public.sale_payments where is_demo;
  delete from public.sale_lines where sale_id in (select id from public.sales where is_demo);
  update public.orders set sale_id = null where sale_id in (select id from public.sales where is_demo);
  delete from public.sales where is_demo;
  delete from public.order_lines where order_id in (select id from public.orders where is_demo);
  delete from public.orders where is_demo;
  delete from public.receiving_lines where receipt_id in (select id from public.receiving_records where is_demo);
  delete from public.receiving_records where is_demo;
  delete from public.supplier_payments where is_demo;
  delete from public.purchase_invoice_lines where invoice_id in (select id from public.purchase_invoices where is_demo);
  delete from public.purchase_invoices where is_demo;
  delete from public.production_batch_lines where batch_id in (select id from public.production_batches where is_demo);
  delete from public.production_batches where is_demo;
  delete from public.recipe_lines where recipe_id in (select id from public.recipes where is_demo);
  delete from public.recipes where is_demo;
  delete from public.expenses where is_demo;
  delete from public.customers where is_demo;
  delete from public.suppliers where is_demo;
  delete from public.items where is_demo;
end;
$$;

create or replace function public.last_change(p_table text, p_id uuid)
returns table (user_email text, changed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  if p_table not in ('sales', 'purchase_invoices', 'production_batches', 'journal_entries') then
    raise exception 'not allowed';
  end if;
  return query
  select audit_logs.user_email, audit_logs.created_at
  from public.audit_logs
  where audit_logs.table_name = p_table and audit_logs.record_id = p_id
  order by audit_logs.created_at desc
  limit 1;
end;
$$;

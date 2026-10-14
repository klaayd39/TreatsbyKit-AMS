-- Database rules. These run for every insert, including inside RPCs.

create or replace function public.guard_journal_entry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_demo_purge', true) = 'on' and old.is_demo then
    return old;
  end if;
  if tg_op = 'UPDATE' and current_setting('app.journal_reversal', true) = 'on' then
    if new.entry_number is distinct from old.entry_number
      or new.date is distinct from old.date
      or new.description is distinct from old.description
      or new.source_type is distinct from old.source_type
      or new.source_id is distinct from old.source_id
      or new.event_key is distinct from old.event_key
      or new.reversal_of_id is distinct from old.reversal_of_id
      or new.is_demo is distinct from old.is_demo
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
    then
      raise exception 'journal entries cannot be changed';
    end if;
    return new;
  end if;
  raise exception 'journal entries cannot be changed';
end;
$$;

create trigger journal_entries_guard
before update or delete on public.journal_entries
for each row execute function public.guard_journal_entry();

create or replace function public.guard_journal_line()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_demo_purge', true) = 'on' then
    if exists (select 1 from public.journal_entries where id = old.entry_id and is_demo) then
      return old;
    end if;
  end if;
  raise exception 'journal entries cannot be changed';
end;
$$;

create trigger journal_lines_guard
before update or delete on public.journal_lines
for each row execute function public.guard_journal_line();

create or replace function public.guard_stock_movement()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_demo_purge', true) = 'on' and old.is_demo then
    return old;
  end if;
  raise exception 'stock movements cannot be changed';
end;
$$;

create trigger stock_movements_guard
before update or delete on public.stock_movements
for each row execute function public.guard_stock_movement();

create or replace function public.guard_audit_log()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit logs cannot be changed';
end;
$$;

create trigger audit_logs_guard
before update or delete on public.audit_logs
for each row execute function public.guard_audit_log();

create or replace function public.assert_entry_balanced()
returns trigger
language plpgsql
as $$
declare
  debits numeric(14, 2);
  credits numeric(14, 2);
  entry uuid := coalesce(new.entry_id, old.entry_id);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into debits, credits
  from public.journal_lines
  where entry_id = entry;
  if debits <> credits or debits <= 0 then
    raise exception 'unbalanced entry';
  end if;
  return null;
end;
$$;

create constraint trigger journal_lines_balance
after insert on public.journal_lines
deferrable initially deferred
for each row execute function public.assert_entry_balanced();

create or replace function public.guard_books_lock()
returns trigger
language plpgsql
as $$
declare
  locked date;
begin
  select books_locked_through into locked from public.business_settings limit 1;
  if locked is not null and new.date <= locked then
    raise exception 'books are locked through %', locked;
  end if;
  return new;
end;
$$;

create trigger journal_entries_lock
before insert on public.journal_entries
for each row execute function public.guard_books_lock();

create trigger stock_movements_lock
before insert on public.stock_movements
for each row execute function public.guard_books_lock();

-- Adjustments are the existing count-correction flow. They may take a quantity
-- below zero. Every other movement is blocked. create_stock_adjustment is
-- limited to owner and bookkeeper.
create or replace function public.guard_negative_stock()
returns trigger
language plpgsql
as $$
declare
  on_hand numeric(14, 4);
begin
  if new.type = 'adjustment' then
    return new;
  end if;
  perform 1 from public.items where id = new.item_id for update;
  select coalesce(sum(quantity_in - quantity_out), 0) into on_hand
  from public.stock_movements
  where item_id = new.item_id;
  if on_hand + new.quantity_in - new.quantity_out < 0 then
    raise exception 'negative stock';
  end if;
  return new;
end;
$$;

create trigger stock_movements_non_negative
before insert on public.stock_movements
for each row execute function public.guard_negative_stock();

create or replace function public.guard_supplier_overpay()
returns trigger
language plpgsql
as $$
declare
  received numeric(14, 2);
  paid numeric(14, 2);
begin
  select coalesce(sum(round(receiving_lines.quantity * purchase_invoice_lines.unit_price, 2)), 0)
    into received
  from public.receiving_lines
  join public.receiving_records on receiving_records.id = receiving_lines.receipt_id
  join public.purchase_invoice_lines on purchase_invoice_lines.id = receiving_lines.invoice_line_id
  where receiving_records.invoice_id = new.invoice_id;

  select coalesce(sum(amount), 0) into paid
  from public.supplier_payments
  where invoice_id = new.invoice_id;

  if paid > received then
    raise exception 'overpayment';
  end if;
  return null;
end;
$$;

create constraint trigger supplier_payments_overpay
after insert on public.supplier_payments
deferrable initially deferred
for each row execute function public.guard_supplier_overpay();

create or replace function public.guard_customer_overpay()
returns trigger
language plpgsql
as $$
declare
  expected numeric(14, 2);
  paid numeric(14, 2);
begin
  if new.role = 'sale' and new.kind = 'payment' and new.amount > 0 and new.sale_id is not null then
    select total into expected from public.sales where id = new.sale_id;
    select coalesce(sum(amount), 0) into paid
    from public.sale_payments
    where sale_id = new.sale_id and role = 'sale' and kind = 'payment' and amount > 0;
    if paid > expected then
      raise exception 'overpayment';
    end if;
  end if;
  if new.role = 'deposit' and new.amount > 0 and new.order_id is not null then
    select total into expected from public.orders where id = new.order_id;
    select coalesce(sum(amount), 0) into paid
    from public.sale_payments
    where order_id = new.order_id and role = 'deposit' and amount > 0;
    if paid > expected then
      raise exception 'overpayment';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger sale_payments_overpay
after insert on public.sale_payments
deferrable initially deferred
for each row execute function public.guard_customer_overpay();

create or replace function public.guard_account()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.system then
      raise exception 'system accounts cannot be deleted';
    end if;
    return old;
  end if;
  if old.system and new.type is distinct from old.type then
    raise exception 'system accounts cannot change type';
  end if;
  if old.system and new.code is distinct from old.code then
    raise exception 'system accounts cannot change type';
  end if;
  return new;
end;
$$;

create trigger accounts_guard
before update or delete on public.accounts
for each row execute function public.guard_account();

-- Audit log and per-user notification state. The audit trigger is attached
-- after every business table exists.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb,
  user_id uuid,
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index audit_logs_lookup_idx on public.audit_logs (created_at desc, table_name, action);

create table public.notification_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  notification_key text not null,
  read boolean not null default false,
  dismissed boolean not null default false,
  active boolean not null default true,
  detected text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (user_id, notification_key)
);

create trigger notification_states_updated before update on public.notification_states
for each row execute function public.set_updated_at();

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_email text := '';
  row_id uuid;
begin
  if tg_table_name = 'audit_logs' then
    return coalesce(new, old);
  end if;
  select email into actor_email from public.profiles where id = actor;
  if tg_table_name = 'notification_states' then
    row_id := coalesce(new.id, old.id);
  else
    row_id := coalesce(new.id, old.id);
  end if;
  insert into public.audit_logs (table_name, record_id, action, old_row, new_row, user_id, user_email, created_by)
  values (
    tg_table_name,
    row_id,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    actor,
    coalesce(actor_email, ''),
    actor
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'business_settings', 'number_sequences', 'items', 'suppliers', 'customers', 'accounts',
    'purchase_invoices', 'purchase_invoice_lines', 'receiving_records', 'receiving_lines', 'supplier_payments',
    'recipes', 'recipe_lines', 'production_batches', 'production_batch_lines',
    'orders', 'order_lines', 'sales', 'sale_lines', 'sale_payments',
    'expenses', 'stock_movements', 'journal_entries', 'journal_lines', 'notification_states'
  ]
  loop
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

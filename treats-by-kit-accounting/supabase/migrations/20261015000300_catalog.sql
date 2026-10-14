-- Items, suppliers, customers, and the chart of accounts.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('raw_material', 'finished_good', 'packaging')),
  unit text not null,
  reorder_level numeric(14, 4) not null default 0,
  selling_price numeric(14, 2),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger items_updated before update on public.items
for each row execute function public.set_updated_at();

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger suppliers_updated before update on public.suppliers
for each row execute function public.set_updated_at();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger customers_updated before update on public.customers
for each row execute function public.set_updated_at();

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in (
    'asset', 'liability', 'equity', 'revenue', 'contra_revenue', 'cogs', 'contra_cogs', 'expense'
  )),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  description text not null default '',
  active boolean not null default true,
  system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger accounts_updated before update on public.accounts
for each row execute function public.set_updated_at();

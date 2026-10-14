-- Purchase invoices, receiving, and supplier payments.

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  payment_terms text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (supplier_id, invoice_number)
);

create trigger purchase_invoices_updated before update on public.purchase_invoices
for each row execute function public.set_updated_at();

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger purchase_invoice_lines_updated before update on public.purchase_invoice_lines
for each row execute function public.set_updated_at();

create table public.receiving_records (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete restrict,
  date date not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger receiving_records_updated before update on public.receiving_records
for each row execute function public.set_updated_at();

create table public.receiving_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receiving_records (id) on delete restrict,
  invoice_line_id uuid not null references public.purchase_invoice_lines (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger receiving_lines_updated before update on public.receiving_lines
for each row execute function public.set_updated_at();

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete restrict,
  date date not null,
  method text not null check (method in ('cash', 'gcash', 'bank_transfer', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  reference text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger supplier_payments_updated before update on public.supplier_payments
for each row execute function public.set_updated_at();

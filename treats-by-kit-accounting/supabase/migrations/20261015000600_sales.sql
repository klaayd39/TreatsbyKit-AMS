-- Orders, sales, and customer payments.
-- Deposits live in sale_payments (sale_id nullable, order_id set) because one
-- payment can later be linked to both the order and the sale. order_payments
-- is a view over those rows.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_date date not null,
  fulfillment_date date not null,
  fulfillment_type text not null check (fulfillment_type in ('pickup', 'delivery')),
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'ready', 'completed', 'cancelled')),
  subtotal numeric(14, 2) not null default 0,
  discount_type text not null default 'amount',
  discount_value numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  cancel_reason text not null default '',
  cancelled_at timestamptz,
  down_payment_disposition text,
  sale_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger orders_updated before update on public.orders
for each row execute function public.set_updated_at();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger order_lines_updated before update on public.order_lines
for each row execute function public.set_updated_at();

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  date date not null,
  sold_at timestamptz not null default now(),
  customer_id uuid references public.customers (id) on delete restrict,
  source text not null default 'pos' check (source in ('pos', 'order')),
  order_id uuid references public.orders (id) on delete restrict,
  subtotal numeric(14, 2) not null default 0,
  discount_type text not null default 'amount',
  discount_value numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  cogs_total numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  status text not null default 'completed' check (status in ('completed', 'voided')),
  void_reason text not null default '',
  voided_at timestamptz,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger sales_updated before update on public.sales
for each row execute function public.set_updated_at();

alter table public.orders
  add constraint orders_sale_id_fkey
  foreign key (sale_id) references public.sales (id) on delete restrict;

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  unit_cost numeric(14, 4) not null default 0,
  line_total numeric(14, 2) not null default 0,
  revenue numeric(14, 2) not null default 0,
  cogs numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger sale_lines_updated before update on public.sale_lines
for each row execute function public.set_updated_at();

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  date date not null,
  method text not null check (method in ('cash', 'gcash', 'bank_transfer', 'other')),
  amount numeric(14, 2) not null check (amount <> 0),
  tendered numeric(14, 2) not null default 0,
  change_due numeric(14, 2) not null default 0,
  kind text not null check (kind in ('payment', 'refund')),
  role text not null check (role in ('sale', 'deposit', 'refund')),
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (sale_id is not null or order_id is not null)
);

create trigger sale_payments_updated before update on public.sale_payments
for each row execute function public.set_updated_at();

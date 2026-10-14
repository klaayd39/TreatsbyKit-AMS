-- Recipes and production batches.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  finished_item_id uuid not null references public.items (id) on delete restrict,
  yield_quantity numeric(14, 4) not null check (yield_quantity > 0),
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger recipes_updated before update on public.recipes
for each row execute function public.set_updated_at();

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (recipe_id, item_id)
);

create trigger recipe_lines_updated before update on public.recipe_lines
for each row execute function public.set_updated_at();

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  date date not null,
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  finished_item_id uuid not null references public.items (id) on delete restrict,
  quantity_produced numeric(14, 4) not null check (quantity_produced > 0),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text not null default '',
  labor_cost numeric(14, 2) not null default 0,
  overhead_cost numeric(14, 2) not null default 0,
  ingredient_cost numeric(14, 2) not null default 0,
  waste_cost numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  cost_per_unit numeric(14, 4) not null default 0,
  cancel_reason text not null default '',
  cancelled_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger production_batches_updated before update on public.production_batches
for each row execute function public.set_updated_at();

create table public.production_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  expected_qty numeric(14, 4) not null default 0,
  actual_qty numeric(14, 4) not null default 0,
  waste_qty numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger production_batch_lines_updated before update on public.production_batch_lines
for each row execute function public.set_updated_at();

-- Expenses, the stock ledger, and the journal.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  due_date date,
  payee text not null,
  category text not null references public.accounts (code) on delete restrict,
  description text not null default '',
  amount numeric(14, 2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'gcash', 'bank_transfer', 'other')),
  status text not null check (status in ('paid', 'unpaid', 'voided')),
  reference text not null default '',
  notes text not null default '',
  void_reason text not null default '',
  voided_at timestamptz,
  posting_revision integer not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger expenses_updated before update on public.expenses
for each row execute function public.set_updated_at();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  item_id uuid not null references public.items (id) on delete restrict,
  type text not null check (type in (
    'purchase', 'production_use', 'production_output', 'sale', 'waste', 'adjustment'
  )),
  quantity_in numeric(14, 4) not null default 0 check (quantity_in >= 0),
  quantity_out numeric(14, 4) not null default 0 check (quantity_out >= 0),
  unit_cost numeric(14, 4) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (quantity_in > 0 or quantity_out > 0)
);

create index stock_movements_item_idx on public.stock_movements (item_id, date);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null unique,
  date date not null,
  description text not null,
  source_type text not null default 'manual',
  source_id uuid,
  event_key text,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  reversed_by_id uuid,
  reversal_of_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (source_type = 'manual' or event_key is not null)
);

create unique index journal_entries_event_key_idx on public.journal_entries (event_key);

alter table public.journal_entries
  add constraint journal_entries_reversed_by_fkey
  foreign key (reversed_by_id) references public.journal_entries (id) on delete restrict;

alter table public.journal_entries
  add constraint journal_entries_reversal_of_fkey
  foreign key (reversal_of_id) references public.journal_entries (id) on delete restrict;

create index journal_entries_date_idx on public.journal_entries (date);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  memo text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);

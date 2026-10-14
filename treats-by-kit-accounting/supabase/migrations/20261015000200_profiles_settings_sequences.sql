-- Profiles, the single business settings row, and locked document numbers.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'viewer' check (role in ('owner', 'bookkeeper', 'cashier', 'viewer')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active, created_by)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'viewer',
    false,
    new.id
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = coalesce(new.email, '')
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email
after update of email on auth.users
for each row execute function public.sync_profile_email();

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Treats by Kit',
  address text not null default '',
  contact text not null default '',
  receipt_footer text not null default '',
  currency text not null default 'PHP' check (currency = 'PHP'),
  low_stock_default numeric(14, 4) not null default 0,
  variance_threshold numeric(8, 2) not null default 10,
  books_locked_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger business_settings_updated
before update on public.business_settings
for each row execute function public.set_updated_at();

create table public.number_sequences (
  id uuid primary key default gen_random_uuid(),
  prefix text not null unique,
  last_value integer not null default 0,
  width integer not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create trigger number_sequences_updated
before update on public.number_sequences
for each row execute function public.set_updated_at();

-- Locks the sequence row so two users cannot take the same number.
create or replace function public.next_document_number(p_prefix text, p_width integer default 4)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  seq record;
begin
  insert into public.number_sequences as sequences (prefix, last_value, width)
  values (p_prefix, 1, p_width)
  on conflict (prefix) do update
    set last_value = sequences.last_value + 1
  returning last_value, width into seq;
  return p_prefix || '-' || lpad(seq.last_value::text, seq.width, '0');
end;
$$;

revoke all on function public.next_document_number(text, integer) from public;
grant execute on function public.next_document_number(text, integer) to authenticated;

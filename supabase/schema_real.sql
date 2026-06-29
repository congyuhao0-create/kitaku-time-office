-- Kitaku Time Office real data schema
-- Run this after schema.sql. It creates normalized tables with RLS.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'collaborator', 'operator')),
  display_name text not null,
  kana text,
  email text,
  phone text,
  area text,
  household text,
  emergency_contact text,
  purpose text,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_operator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'operator', false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_key text not null unique,
  booking_type text not null check (booking_type in ('office', 'childcare')),
  place_id text not null,
  resource_id text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  child_info text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  source text not null default 'user' check (source in ('user', 'operator', 'template')),
  title text not null,
  category text not null default 'こども',
  person text,
  place text,
  content text,
  desired_time text,
  credit numeric(6,2) not null default 1,
  photo_name text,
  photo_data_url text,
  status text not null default 'open' check (status in ('open', 'accepted', 'cancelled', 'closed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text,
  title text not null,
  amount numeric(8,2) not null,
  entry_type text not null check (entry_type in ('earn', 'spend', 'freeze', 'expire', 'adjust')),
  meta text,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  category text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_actions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists bookings_user_status_date_idx on public.bookings (user_id, status, date);
create index if not exists bookings_status_date_idx on public.bookings (status, date);
create index if not exists service_requests_owner_status_idx on public.service_requests (owner_id, status);
create index if not exists service_requests_accepted_status_idx on public.service_requests (accepted_by, status);
create index if not exists service_requests_source_status_idx on public.service_requests (source, status);
create index if not exists time_ledger_user_created_idx on public.time_ledger (user_id, created_at desc);
create index if not exists safety_records_user_status_idx on public.safety_records (user_id, status);
create index if not exists operator_actions_operator_created_idx on public.operator_actions (operator_id, created_at desc);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at before update on public.bookings for each row execute function public.touch_updated_at();
drop trigger if exists service_requests_touch_updated_at on public.service_requests;
create trigger service_requests_touch_updated_at before update on public.service_requests for each row execute function public.touch_updated_at();
drop trigger if exists safety_records_touch_updated_at on public.safety_records;
create trigger safety_records_touch_updated_at before update on public.safety_records for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.service_requests enable row level security;
alter table public.time_ledger enable row level security;
alter table public.safety_records enable row level security;
alter table public.operator_actions enable row level security;

drop policy if exists "profiles select own or operator" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own or operator" on public.profiles;
drop policy if exists "profiles update own non operator" on public.profiles;
drop policy if exists "profiles update operator" on public.profiles;
create policy "profiles select own or operator" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_operator()));
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()) and role in ('parent', 'collaborator'));
create policy "profiles update own non operator" on public.profiles for update to authenticated using (id = (select auth.uid()) and role in ('parent', 'collaborator')) with check (id = (select auth.uid()) and role in ('parent', 'collaborator'));
create policy "profiles update operator" on public.profiles for update to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

drop policy if exists "bookings select own or operator" on public.bookings;
drop policy if exists "bookings insert own" on public.bookings;
drop policy if exists "bookings update own or operator" on public.bookings;
create policy "bookings select own or operator" on public.bookings for select to authenticated using (user_id = (select auth.uid()) or (select public.is_operator()));
create policy "bookings insert own" on public.bookings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bookings update own or operator" on public.bookings for update to authenticated using (user_id = (select auth.uid()) or (select public.is_operator())) with check (user_id = (select auth.uid()) or (select public.is_operator()));

drop policy if exists "service requests visible by role" on public.service_requests;
drop policy if exists "service requests insert own" on public.service_requests;
drop policy if exists "service requests update related or operator" on public.service_requests;
create policy "service requests visible by role" on public.service_requests for select to authenticated using (status = 'open' or owner_id = (select auth.uid()) or accepted_by = (select auth.uid()) or (select public.is_operator()));
create policy "service requests insert own" on public.service_requests for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "service requests update related or operator" on public.service_requests for update to authenticated using (owner_id = (select auth.uid()) or accepted_by = (select auth.uid()) or (select public.is_operator())) with check (owner_id = (select auth.uid()) or accepted_by = (select auth.uid()) or (select public.is_operator()));

drop policy if exists "ledger select own or operator" on public.time_ledger;
drop policy if exists "ledger insert own or operator" on public.time_ledger;
create policy "ledger select own or operator" on public.time_ledger for select to authenticated using (user_id = (select auth.uid()) or (select public.is_operator()));
create policy "ledger insert own or operator" on public.time_ledger for insert to authenticated with check (user_id = (select auth.uid()) or (select public.is_operator()));

drop policy if exists "safety select own or operator" on public.safety_records;
drop policy if exists "safety insert own or operator" on public.safety_records;
drop policy if exists "safety update operator" on public.safety_records;
create policy "safety select own or operator" on public.safety_records for select to authenticated using (user_id = (select auth.uid()) or (select public.is_operator()));
create policy "safety insert own or operator" on public.safety_records for insert to authenticated with check (user_id = (select auth.uid()) or (select public.is_operator()));
create policy "safety update operator" on public.safety_records for update to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

drop policy if exists "operator actions operator only" on public.operator_actions;
drop policy if exists "operator actions insert operator only" on public.operator_actions;
create policy "operator actions operator only" on public.operator_actions for select to authenticated using ((select public.is_operator()));
create policy "operator actions insert operator only" on public.operator_actions for insert to authenticated with check ((select public.is_operator()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_requests') then
    alter publication supabase_realtime add table public.service_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_ledger') then
    alter publication supabase_realtime add table public.time_ledger;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'safety_records') then
    alter publication supabase_realtime add table public.safety_records;
  end if;
end $$;

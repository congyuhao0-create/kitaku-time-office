-- Kitaku Time Office prototype cloud sync
-- Run this in Supabase SQL Editor.

create table if not exists public.time_office_snapshots (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.time_office_snapshots enable row level security;

drop policy if exists "prototype read snapshots" on public.time_office_snapshots;
drop policy if exists "prototype insert snapshots" on public.time_office_snapshots;
drop policy if exists "prototype update snapshots" on public.time_office_snapshots;

create policy "prototype read snapshots"
on public.time_office_snapshots
for select
to anon, authenticated
using (true);

create policy "prototype insert snapshots"
on public.time_office_snapshots
for insert
to anon, authenticated
with check (true);

create policy "prototype update snapshots"
on public.time_office_snapshots
for update
to anon, authenticated
using (true)
with check (true);

insert into public.time_office_snapshots (id, payload)
values ('kitaku-main', '{}'::jsonb)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'time_office_snapshots'
  ) then
    alter publication supabase_realtime add table public.time_office_snapshots;
  end if;
end $$;

-- Recommended normalized tables for the next production phase:
-- user_profiles, verification_statuses, coworking_bookings,
-- service_requests, service_acceptances, time_credit_ledger,
-- safety_records, incident_reports, partner_benefits.

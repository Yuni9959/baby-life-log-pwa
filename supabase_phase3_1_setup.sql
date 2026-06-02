-- Baby Life Log App - Phase 3.1 Supabase minimal connection setup
-- Purpose:
-- 1. Check server connectivity with anonymous Supabase users.
-- 2. Verify RLS behavior.
-- 3. Prepare the cloud_backups table for Phase 3.2.
--
-- Security notes:
-- - Never put a service_role key in a client-side file.
-- - Do not allow public read/write access without RLS.
-- - Phase 3.1 does not upload records, profile, settings, or appData.

create extension if not exists pgcrypto;

-- 1. Connection check table
create table if not exists public.cloud_connection_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id text,
  app_version text not null default '3.1',
  client_status text not null default 'connected',
  client_created_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cloud_connection_checks enable row level security;

drop policy if exists "Users can select own connection checks" on public.cloud_connection_checks;
drop policy if exists "Users can insert own connection checks" on public.cloud_connection_checks;
drop policy if exists "Users can delete own connection checks" on public.cloud_connection_checks;

create policy "Users can select own connection checks"
on public.cloud_connection_checks
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own connection checks"
on public.cloud_connection_checks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete own connection checks"
on public.cloud_connection_checks
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists idx_cloud_connection_checks_user_created
on public.cloud_connection_checks (user_id, created_at desc);

-- 2. Backup table prepared for Phase 3.2
-- Phase 3.1 must not store actual appData in this table.
create table if not exists public.cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id text,
  app_version text not null,
  schema_version integer not null,
  backup_type text not null default 'manual',
  record_count integer not null default 0,
  first_record_at timestamptz,
  last_record_at timestamptz,
  baby_name text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cloud_backups enable row level security;

drop policy if exists "Users can select own backups" on public.cloud_backups;
drop policy if exists "Users can insert own backups" on public.cloud_backups;
drop policy if exists "Users can update own backups" on public.cloud_backups;
drop policy if exists "Users can delete own backups" on public.cloud_backups;

create policy "Users can select own backups"
on public.cloud_backups
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own backups"
on public.cloud_backups
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own backups"
on public.cloud_backups
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own backups"
on public.cloud_backups
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists idx_cloud_backups_user_created
on public.cloud_backups (user_id, created_at desc);

create index if not exists idx_cloud_backups_user_schema
on public.cloud_backups (user_id, schema_version);

-- 3. updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cloud_backups_set_updated_at on public.cloud_backups;

create trigger trg_cloud_backups_set_updated_at
before update on public.cloud_backups
for each row
execute function public.set_updated_at();

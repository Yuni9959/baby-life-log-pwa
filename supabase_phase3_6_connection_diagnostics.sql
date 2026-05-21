-- Baby life log - Phase 3.6 Supabase real connection diagnostics
-- Purpose:
-- 1. Verify that the app can really insert/select rows in Supabase DB.
-- 2. Create/read diagnostic rows through RLS using the current auth.uid().
-- 3. Provide minimum table structure reinforcement before family/baby/records checks.
--
-- Safety:
-- - Do not delete existing data.
-- - Do not drop existing tables.
-- - Do not put service_role keys, DB passwords, or direct connection strings in client files.

create extension if not exists pgcrypto;

create table if not exists public.cloud_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text null,
  check_type text not null default 'manual',
  status text not null default 'ok',
  message text null,
  app_version text not null default '3.6',
  client_created_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint cloud_diagnostics_status_check check (
    status in ('ok', 'warning', 'error')
  )
);

alter table public.cloud_diagnostics enable row level security;

drop policy if exists "Users can select own diagnostics" on public.cloud_diagnostics;
drop policy if exists "Users can insert own diagnostics" on public.cloud_diagnostics;
drop policy if exists "Users can delete own diagnostics" on public.cloud_diagnostics;

create policy "Users can select own diagnostics"
on public.cloud_diagnostics
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own diagnostics"
on public.cloud_diagnostics
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete own diagnostics"
on public.cloud_diagnostics
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists idx_cloud_diagnostics_user_created
on public.cloud_diagnostics (user_id, created_at desc);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 가족',
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),

  constraint family_members_role_check check (
    role in ('owner', 'parent', 'caregiver', 'viewer')
  ),

  constraint family_members_unique unique (family_id, user_id)
);

alter table public.family_members enable row level security;

create index if not exists idx_family_members_user
on public.family_members (user_id);

create index if not exists idx_family_members_family
on public.family_members (family_id);

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default '아기',
  birth_date date null,
  gender text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.babies enable row level security;

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid null references public.families(id) on delete cascade,
  baby_id uuid null references public.babies(id) on delete cascade,
  type text not null,
  subtype text null,
  amount_ml integer null,
  note text not null default '',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  client_id text not null,
  device_id text null,
  user_id uuid null references auth.users(id) on delete cascade,
  record_id text null,
  amount integer null,
  memo text null,
  is_sample boolean not null default false,
  app_version text not null default '3.6',
  schema_version integer not null default 2,
  payload jsonb not null default '{}'::jsonb
);

alter table public.records enable row level security;

-- families / babies / family_members / records detailed RLS policies are expected
-- from Phase 3.3/3.5 SQL. If those policies are missing, run the earlier phase SQL
-- files before relying on app-level family/baby/records diagnostics.

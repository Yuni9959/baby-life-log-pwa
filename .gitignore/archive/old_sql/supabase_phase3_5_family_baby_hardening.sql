-- Baby life log app - Phase 3.5 family_id / baby_id hardening
-- Purpose:
-- 1. Stabilize family / baby structure.
-- 2. Prepare profile <-> babies synchronization.
-- 3. Standardize records around family_id / baby_id / client_id / device_id.
-- 4. Prepare for Phase 4 auth transition.
--
-- Safety:
-- - Do not drop existing tables.
-- - Do not delete existing records.
-- - Do not use service_role keys or direct DB connection strings in the client.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  constraint family_members_role_check check (role in ('owner', 'parent', 'caregiver', 'viewer')),
  constraint family_members_unique unique (family_id, user_id)
);

alter table public.family_members enable row level security;

create index if not exists idx_family_members_user on public.family_members (user_id);
create index if not exists idx_family_members_family on public.family_members (family_id);
create index if not exists idx_family_members_family_role on public.family_members (family_id, role);

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default '아기',
  birth_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.babies add column if not exists gender text null;

alter table public.babies drop constraint if exists babies_gender_check;
alter table public.babies
  add constraint babies_gender_check check (
    gender is null or gender in ('male', 'female', 'unknown', 'unspecified')
  );

alter table public.babies enable row level security;

create index if not exists idx_babies_family on public.babies (family_id);
create index if not exists idx_babies_family_created on public.babies (family_id, created_at);

drop trigger if exists trg_babies_set_updated_at on public.babies;
create trigger trg_babies_set_updated_at
before update on public.babies
for each row
execute function public.set_updated_at();

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid null references public.families(id) on delete cascade,
  baby_id uuid null references public.babies(id) on delete cascade,
  type text not null,
  subtype text null,
  amount_ml integer null,
  note text not null default '',
  recorded_at timestamptz not null,
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
  app_version text not null default '3.5',
  schema_version integer not null default 2,
  payload jsonb not null default '{}'::jsonb
);

alter table public.records add column if not exists family_id uuid null references public.families(id) on delete cascade;
alter table public.records add column if not exists baby_id uuid null references public.babies(id) on delete cascade;
alter table public.records add column if not exists client_id text;
alter table public.records add column if not exists device_id text null;
alter table public.records add column if not exists user_id uuid null references auth.users(id) on delete cascade;
alter table public.records add column if not exists record_id text null;
alter table public.records add column if not exists amount integer null;
alter table public.records add column if not exists memo text null;
alter table public.records add column if not exists amount_ml integer null;
alter table public.records add column if not exists note text not null default '';
alter table public.records add column if not exists recorded_at timestamptz;
alter table public.records add column if not exists deleted_at timestamptz null;
alter table public.records add column if not exists is_sample boolean not null default false;
alter table public.records add column if not exists app_version text not null default '3.5';
alter table public.records add column if not exists schema_version integer not null default 2;
alter table public.records add column if not exists payload jsonb not null default '{}'::jsonb;

update public.records
set client_id = coalesce(client_id, record_id, id::text)
where client_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'record_created_at'
  ) then
    execute 'update public.records set recorded_at = coalesce(recorded_at, record_created_at, created_at, now()) where recorded_at is null';
  else
    update public.records set recorded_at = coalesce(recorded_at, created_at, now()) where recorded_at is null;
  end if;
end $$;

update public.records
set amount_ml = coalesce(amount_ml, amount)
where amount_ml is null and amount is not null;

update public.records
set note = coalesce(nullif(note, ''), memo, '')
where (note is null or note = '') and memo is not null;

update public.records
set record_id = coalesce(record_id, client_id)
where record_id is null;

alter table public.records alter column client_id set not null;
alter table public.records alter column recorded_at set not null;
alter table public.records alter column note set default '';
alter table public.records alter column app_version set default '3.5';
alter table public.records alter column schema_version set default 2;
alter table public.records alter column payload set default '{}'::jsonb;

alter table public.records enable row level security;

alter table public.records drop constraint if exists records_type_check;
alter table public.records
  add constraint records_type_check check (
    type in ('feeding', 'burp', 'diaper', 'sleep_start', 'sleep_end', 'wake', 'custom', 'test')
  );

alter table public.records drop constraint if exists records_subtype_check;
alter table public.records
  add constraint records_subtype_check check (
    subtype is null or subtype in ('pee', 'poop', 'pee_poop', 'formula', 'breast', 'pumped', 'connection')
  );

alter table public.records drop constraint if exists records_amount_ml_check;
alter table public.records
  add constraint records_amount_ml_check check (amount_ml is null or amount_ml >= 0);

create unique index if not exists idx_records_family_client_unique
on public.records (family_id, client_id)
where family_id is not null and deleted_at is null;

create unique index if not exists idx_records_user_client_unique
on public.records (user_id, client_id)
where user_id is not null and family_id is null and deleted_at is null;

create index if not exists idx_records_family_baby_recorded on public.records (family_id, baby_id, recorded_at desc);
create index if not exists idx_records_family_deleted on public.records (family_id, deleted_at);
create index if not exists idx_records_baby_recorded on public.records (baby_id, recorded_at desc);
create index if not exists idx_records_client on public.records (client_id);
create index if not exists idx_records_device on public.records (device_id);
create index if not exists idx_records_user on public.records (user_id);

drop trigger if exists trg_records_set_updated_at on public.records;
create trigger trg_records_set_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

-- RLS policies are intentionally not dropped/recreated here.
-- If select/insert/update fails after this migration, run or review the Phase 3.3 RLS policy SQL.

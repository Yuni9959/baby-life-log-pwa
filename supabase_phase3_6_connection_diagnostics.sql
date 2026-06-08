-- Baby life log - Phase 3.6 Supabase real connection diagnostics
--
-- Run this file in the Supabase SQL Editor for project:
-- https://vburjgyfjhgtkulabrnf.supabase.co
--
-- Safety:
-- - Does not drop existing tables.
-- - Does not delete existing app data.
-- - Does not require or contain service_role keys, secret keys, DB passwords,
--   direct connection strings, or localStorage operations.

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
  name text not null default 'My family',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.families add column if not exists updated_at timestamptz not null default now();
alter table public.families enable row level security;

drop trigger if exists trg_families_set_updated_at on public.families;
create trigger trg_families_set_updated_at
before update on public.families
for each row
execute function public.set_updated_at();

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_role_check check (role in ('owner', 'parent', 'caregiver', 'viewer')),
  constraint family_members_unique unique (family_id, user_id)
);

alter table public.family_members add column if not exists updated_at timestamptz not null default now();
alter table public.family_members enable row level security;

create index if not exists idx_family_members_user on public.family_members (user_id);
create index if not exists idx_family_members_family on public.family_members (family_id);

drop trigger if exists trg_family_members_set_updated_at on public.family_members;
create trigger trg_family_members_set_updated_at
before update on public.family_members
for each row
execute function public.set_updated_at();

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default 'Baby',
  birth_date date null,
  gender text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.babies add column if not exists birth_date date null;
alter table public.babies add column if not exists gender text null;
alter table public.babies add column if not exists updated_at timestamptz not null default now();
alter table public.babies enable row level security;

create index if not exists idx_babies_family on public.babies (family_id);

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

alter table public.records add column if not exists family_id uuid null references public.families(id) on delete cascade;
alter table public.records add column if not exists baby_id uuid null references public.babies(id) on delete cascade;
alter table public.records add column if not exists type text;
alter table public.records add column if not exists subtype text null;
alter table public.records add column if not exists amount_ml integer null;
alter table public.records add column if not exists note text not null default '';
alter table public.records add column if not exists recorded_at timestamptz;
alter table public.records add column if not exists updated_at timestamptz not null default now();
alter table public.records add column if not exists deleted_at timestamptz null;
alter table public.records add column if not exists client_id text;
alter table public.records add column if not exists device_id text null;
alter table public.records add column if not exists user_id uuid null references auth.users(id) on delete cascade;
alter table public.records add column if not exists record_id text null;
alter table public.records add column if not exists amount integer null;
alter table public.records add column if not exists memo text null;
alter table public.records add column if not exists is_sample boolean not null default false;
alter table public.records add column if not exists app_version text not null default '3.6';
alter table public.records add column if not exists schema_version integer not null default 2;
alter table public.records add column if not exists payload jsonb not null default '{}'::jsonb;

update public.records set type = coalesce(type, 'custom') where type is null;
update public.records set client_id = coalesce(client_id, record_id, id::text) where client_id is null;
update public.records set recorded_at = coalesce(recorded_at, created_at, now()) where recorded_at is null;
update public.records set user_id = auth.uid() where false;

alter table public.records alter column type set not null;
alter table public.records alter column client_id set not null;
alter table public.records alter column recorded_at set not null;
alter table public.records alter column app_version set default '3.6';
alter table public.records alter column schema_version set default 2;
alter table public.records alter column payload set default '{}'::jsonb;
alter table public.records enable row level security;

alter table public.records drop constraint if exists records_type_check;
alter table public.records
  add constraint records_type_check check (
    type in ('feeding', 'diaper', 'sleep', 'growth', 'medicine', 'temperature', 'custom', 'test')
  );

alter table public.records drop constraint if exists records_amount_ml_check;
alter table public.records
  add constraint records_amount_ml_check check (amount_ml is null or amount_ml >= 0);

create unique index if not exists idx_records_family_client_unique
on public.records (family_id, client_id)
where family_id is not null;

create unique index if not exists idx_records_user_client_unique
on public.records (user_id, client_id)
where family_id is null and user_id is not null;

create index if not exists idx_records_family_baby_recorded on public.records (family_id, baby_id, recorded_at desc);
create index if not exists idx_records_family_deleted on public.records (family_id, deleted_at);
create index if not exists idx_records_client on public.records (client_id);
create index if not exists idx_records_user on public.records (user_id);

drop trigger if exists trg_records_set_updated_at on public.records;
create trigger trg_records_set_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

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
  constraint cloud_diagnostics_status_check check (status in ('ok', 'warning', 'error'))
);

alter table public.cloud_diagnostics enable row level security;

create index if not exists idx_cloud_diagnostics_user_created
on public.cloud_diagnostics (user_id, created_at desc);

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
  );
$$;

create or replace function public.has_family_role(target_family_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.role = any(allowed_roles)
  );
$$;

create or replace function public.family_has_no_members(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
  );
$$;

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

drop policy if exists "Users can select own families" on public.families;
drop policy if exists "Users can insert families" on public.families;
drop policy if exists "Users can update own families" on public.families;

create policy "Users can select own families"
on public.families
for select
to authenticated
using (public.is_family_member(families.id));

create policy "Users can insert families"
on public.families
for insert
to authenticated
with check (true);

create policy "Users can update own families"
on public.families
for update
to authenticated
using (public.has_family_role(families.id, array['owner', 'parent']))
with check (public.has_family_role(families.id, array['owner', 'parent']));

drop policy if exists "Users can select own family memberships" on public.family_members;
drop policy if exists "Users can insert own family memberships" on public.family_members;
drop policy if exists "Users can update own family memberships" on public.family_members;

create policy "Users can select own family memberships"
on public.family_members
for select
to authenticated
using (user_id = auth.uid() or public.is_family_member(family_members.family_id));

create policy "Users can insert own family memberships"
on public.family_members
for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and public.family_has_no_members(family_members.family_id)
  )
  or public.has_family_role(family_members.family_id, array['owner'])
);

create policy "Users can update own family memberships"
on public.family_members
for update
to authenticated
using (public.has_family_role(family_members.family_id, array['owner']))
with check (public.has_family_role(family_members.family_id, array['owner']));

drop policy if exists "Users can select own babies" on public.babies;
drop policy if exists "Users can insert own babies" on public.babies;
drop policy if exists "Users can update own babies" on public.babies;

create policy "Users can select own babies"
on public.babies
for select
to authenticated
using (public.is_family_member(babies.family_id));

create policy "Users can insert own babies"
on public.babies
for insert
to authenticated
with check (public.has_family_role(babies.family_id, array['owner', 'parent']));

create policy "Users can update own babies"
on public.babies
for update
to authenticated
using (public.has_family_role(babies.family_id, array['owner', 'parent']))
with check (public.has_family_role(babies.family_id, array['owner', 'parent']));

drop policy if exists "Users can select own records" on public.records;
drop policy if exists "Users can insert own records" on public.records;
drop policy if exists "Users can update own records" on public.records;

create policy "Users can select own records"
on public.records
for select
to authenticated
using (
  (family_id is not null and public.is_family_member(records.family_id))
  or (family_id is null and user_id = auth.uid())
);

create policy "Users can insert own records"
on public.records
for insert
to authenticated
with check (
  (
    family_id is not null
    and public.has_family_role(records.family_id, array['owner', 'parent', 'caregiver'])
  )
  or (family_id is null and user_id = auth.uid())
);

create policy "Users can update own records"
on public.records
for update
to authenticated
using (
  (
    family_id is not null
    and public.has_family_role(records.family_id, array['owner', 'parent', 'caregiver'])
  )
  or (family_id is null and user_id = auth.uid())
)
with check (
  (
    family_id is not null
    and public.has_family_role(records.family_id, array['owner', 'parent', 'caregiver'])
  )
  or (family_id is null and user_id = auth.uid())
);

-- No hard-delete policy for records. The app uses deleted_at soft delete.

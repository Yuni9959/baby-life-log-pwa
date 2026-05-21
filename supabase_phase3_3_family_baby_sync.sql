-- 아기 생활 기록 앱 — Phase 3.3 family/baby 구조 + 수정/삭제 동기화
-- 목적:
-- 1. families / babies / family_members / records 구조 준비
-- 2. Supabase Auth/RLS 기반 접근 제어
-- 3. records 수정/삭제 서버 반영 준비
-- 4. Phase 4 로그인/가족 공유 확장 준비
--
-- 주의:
-- service_role key를 클라이언트에 넣지 않는다.
-- Direct connection string을 클라이언트에서 사용하지 않는다.
-- RLS 없이 public 접근을 열지 않는다.
-- records 삭제는 hard delete보다 deleted_at soft delete를 우선한다.
-- 기존 records 테이블은 절대 drop하지 않는다.

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

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default '아기',
  birth_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  client_id text not null,
  user_id uuid null references auth.users(id) on delete cascade,
  record_id text null,
  amount integer null,
  memo text null,
  is_sample boolean not null default false,
  app_version text not null default '3.3',
  schema_version integer not null default 2,
  payload jsonb not null default '{}'::jsonb,
  record_created_at timestamptz null,
  record_updated_at timestamptz null
);

alter table public.records add column if not exists family_id uuid null references public.families(id) on delete cascade;
alter table public.records add column if not exists baby_id uuid null references public.babies(id) on delete cascade;
alter table public.records add column if not exists amount_ml integer null;
alter table public.records add column if not exists note text not null default '';
alter table public.records add column if not exists recorded_at timestamptz;
alter table public.records add column if not exists deleted_at timestamptz null;
alter table public.records add column if not exists client_id text;
alter table public.records add column if not exists user_id uuid null references auth.users(id) on delete cascade;
alter table public.records add column if not exists record_id text null;
alter table public.records add column if not exists amount integer null;
alter table public.records add column if not exists memo text null;
alter table public.records add column if not exists is_sample boolean not null default false;
alter table public.records add column if not exists app_version text not null default '3.3';
alter table public.records add column if not exists schema_version integer not null default 2;
alter table public.records add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.records add column if not exists record_created_at timestamptz null;
alter table public.records add column if not exists record_updated_at timestamptz null;

update public.records
set client_id = coalesce(client_id, record_id, id::text)
where client_id is null;

update public.records
set recorded_at = coalesce(recorded_at, record_created_at, created_at, now())
where recorded_at is null;

update public.records
set amount_ml = coalesce(amount_ml, amount)
where amount_ml is null and amount is not null;

update public.records
set note = coalesce(nullif(note, ''), memo, '')
where (note is null or note = '') and memo is not null;

update public.records
set record_id = coalesce(record_id, client_id)
where record_id is null;

update public.records
set record_created_at = coalesce(record_created_at, recorded_at, created_at, now())
where record_created_at is null;

update public.records
set record_updated_at = coalesce(record_updated_at, updated_at, record_created_at, recorded_at, created_at, now())
where record_updated_at is null;

update public.records
set type = 'sleep_start'
where type = 'sleep';

update public.records
set subtype = case
  when type = 'diaper' and subtype in ('pee', 'wet', 'urine', '소변') then 'pee'
  when type = 'diaper' and subtype in ('poop', 'dirty', 'stool', '대변') then 'poop'
  when type = 'diaper' and subtype in ('pee_poop', 'mixed', 'both', '소변+대변') then 'pee_poop'
  when type = 'diaper' then null
  when type = 'feeding' and subtype in ('formula', '분유') then 'formula'
  when type = 'feeding' and subtype in ('breast', '모유') then 'breast'
  when type = 'feeding' and subtype in ('pumped', '유축') then 'pumped'
  when type = 'feeding' then null
  when type = 'test' and subtype = 'connection' then 'connection'
  else null
end
where subtype is not null;

alter table public.records alter column client_id set not null;
alter table public.records alter column recorded_at set not null;
alter table public.records alter column note set default '';
alter table public.records alter column app_version set default '3.3';
alter table public.records alter column schema_version set default 2;
alter table public.records alter column payload set default '{}'::jsonb;

alter table public.records drop constraint if exists records_type_check;
alter table public.records
add constraint records_type_check check (
  type in ('feeding', 'burp', 'diaper', 'sleep_start', 'sleep_end', 'wake', 'custom', 'test')
);

alter table public.records drop constraint if exists records_subtype_check;
alter table public.records
add constraint records_subtype_check check (
  subtype is null
  or subtype in ('pee', 'poop', 'pee_poop', 'formula', 'breast', 'pumped', 'connection')
);

alter table public.records drop constraint if exists records_amount_ml_check;
alter table public.records
add constraint records_amount_ml_check check (amount_ml is null or amount_ml >= 0);

drop index if exists public.idx_records_family_client_unique;
drop index if exists public.idx_records_user_client_unique;

create unique index if not exists idx_records_family_client_unique
on public.records (family_id, client_id)
where family_id is not null;

create unique index if not exists idx_records_user_client_unique
on public.records (user_id, client_id)
where user_id is not null and family_id is null;

create index if not exists idx_records_family_baby_recorded on public.records (family_id, baby_id, recorded_at desc);
create index if not exists idx_records_family_deleted on public.records (family_id, deleted_at);
create index if not exists idx_records_client on public.records (client_id);
create index if not exists idx_records_user on public.records (user_id);

alter table public.records enable row level security;

drop trigger if exists trg_records_set_updated_at on public.records;
create trigger trg_records_set_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

-- SECURITY DEFINER helpers avoid recursive family_members RLS checks.
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

drop policy if exists "Users can select own families" on public.families;
drop policy if exists "Users can insert families" on public.families;
drop policy if exists "Users can update own families" on public.families;
drop policy if exists "Users can delete own families" on public.families;

drop policy if exists "Users can select own family memberships" on public.family_members;
drop policy if exists "Users can insert own family memberships" on public.family_members;
drop policy if exists "Users can update own family memberships" on public.family_members;
drop policy if exists "Users can delete own family memberships" on public.family_members;

drop policy if exists "Users can select own babies" on public.babies;
drop policy if exists "Users can insert own babies" on public.babies;
drop policy if exists "Users can update own babies" on public.babies;
drop policy if exists "Users can delete own babies" on public.babies;

drop policy if exists "Users can select own records" on public.records;
drop policy if exists "Users can insert own records" on public.records;
drop policy if exists "Users can update own records" on public.records;
drop policy if exists "Users can delete own records" on public.records;

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

create policy "Users can delete own records"
on public.records
for delete
to authenticated
using (
  family_id is not null
  and public.has_family_role(records.family_id, array['owner', 'parent'])
);

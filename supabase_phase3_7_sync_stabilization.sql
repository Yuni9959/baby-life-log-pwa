-- 아기 생활 기록 앱 — Phase 3.7 서버 동기화 안정화
-- 목적:
-- 1. 서버/로컬 동기화 안정화
-- 2. family/baby bootstrap RPC 준비
-- 3. client_id / deleted_at / device_id 기준 인덱스 보강
-- 4. Phase 4 로그인 전환 전 안정화
--
-- 주의:
-- 기존 테이블 drop 금지
-- 기존 records 삭제 금지
-- service_role key를 클라이언트에 넣지 않는다.
-- Direct connection string을 클라이언트에서 사용하지 않는다.

create extension if not exists pgcrypto;

-- 1. 기본 테이블 보강
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 가족',
  created_at timestamptz not null default now()
);

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

create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default '아기',
  birth_date date null,
  gender text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  app_version text not null default '3.7',
  schema_version integer not null default 2,
  payload jsonb not null default '{}'::jsonb
);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.records enable row level security;

-- 2. 컬럼 보강
alter table public.records
add column if not exists device_id text null;

alter table public.records
add column if not exists deleted_at timestamptz null;

alter table public.records
add column if not exists client_id text;

alter table public.records
add column if not exists app_version text not null default '3.7';

alter table public.records
add column if not exists schema_version integer not null default 2;

alter table public.records
add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.records
add column if not exists is_sample boolean not null default false;

update public.records
set client_id = coalesce(client_id, record_id, id::text)
where client_id is null;

alter table public.records
alter column client_id set not null;

-- 3. 인덱스 보강
create index if not exists idx_records_family_baby_recorded
on public.records (family_id, baby_id, recorded_at desc);

create index if not exists idx_records_family_baby_updated
on public.records (family_id, baby_id, updated_at desc);

create index if not exists idx_records_family_deleted
on public.records (family_id, deleted_at);

create index if not exists idx_records_client
on public.records (client_id);

create index if not exists idx_records_device
on public.records (device_id);

create index if not exists idx_records_type_sample
on public.records (type, is_sample);

create unique index if not exists idx_records_family_client_unique
on public.records (family_id, client_id)
where family_id is not null and deleted_at is null;

create unique index if not exists idx_records_user_client_unique
on public.records (user_id, client_id)
where user_id is not null and family_id is null and deleted_at is null;

create index if not exists idx_family_members_user
on public.family_members (user_id);

create index if not exists idx_family_members_family_user
on public.family_members (family_id, user_id);

create index if not exists idx_babies_family
on public.babies (family_id);

-- 4. updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_babies_set_updated_at on public.babies;

create trigger trg_babies_set_updated_at
before update on public.babies
for each row
execute function public.set_updated_at();

drop trigger if exists trg_records_set_updated_at on public.records;

create trigger trg_records_set_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

-- 5. family/baby bootstrap RPC
-- 이 함수는 현재 auth.uid() 기준으로 기본 family, family_members, baby를 확보한다.
-- 클라이언트는 service_role key 없이 이 RPC만 호출하면 된다.
create or replace function public.ensure_user_family_context(
  p_family_name text default '우리 가족',
  p_baby_name text default '아기',
  p_birth_date date default null,
  p_gender text default 'unknown'
)
returns table (
  family_id uuid,
  baby_id uuid,
  member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_baby_id uuid;
  v_member_id uuid;
  v_gender text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_gender := coalesce(nullif(p_gender, ''), 'unknown');

  if v_gender not in ('male', 'female', 'unknown', 'unspecified') then
    v_gender := 'unknown';
  end if;

  select fm.family_id, fm.id
    into v_family_id, v_member_id
  from public.family_members fm
  where fm.user_id = v_user_id
  order by fm.created_at asc
  limit 1;

  if v_family_id is null then
    insert into public.families (name)
    values (coalesce(nullif(p_family_name, ''), '우리 가족'))
    returning id into v_family_id;

    insert into public.family_members (family_id, user_id, role)
    values (v_family_id, v_user_id, 'owner')
    returning id into v_member_id;
  end if;

  select b.id
    into v_baby_id
  from public.babies b
  where b.family_id = v_family_id
  order by b.created_at asc
  limit 1;

  if v_baby_id is null then
    insert into public.babies (family_id, name, birth_date, gender)
    values (
      v_family_id,
      coalesce(nullif(p_baby_name, ''), '아기'),
      p_birth_date,
      v_gender
    )
    returning id into v_baby_id;
  end if;

  return query
  select v_family_id, v_baby_id, v_member_id;
end;
$$;

revoke all on function public.ensure_user_family_context(text, text, date, text) from public;
grant execute on function public.ensure_user_family_context(text, text, date, text) to authenticated;

-- 6. 주의:
-- RLS 정책은 Phase 3.3/3.5에서 설정된 정책을 유지한다.
-- 만약 RLS 정책이 없다면 Phase 3.3 SQL을 먼저 실행해야 한다.

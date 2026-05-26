-- 아기 생활 기록 앱 - Phase 3.1 records 서버 저장
-- 목적:
-- 1. records 테이블 생성
-- 2. RLS 활성화
-- 3. 익명 인증 사용자 기준 자기 records만 읽기/쓰기 허용
-- 4. 새 기록 서버 저장 준비
--
-- 주의:
-- service_role key를 클라이언트에 넣지 않는다.
-- RLS 없이 public 접근을 열지 않는다.
-- 모든 사용자가 모든 records를 읽거나 쓰게 만들지 않는다.

create extension if not exists pgcrypto;

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  record_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid null,
  baby_id uuid null,
  type text not null,
  subtype text null,
  amount integer null,
  memo text not null default '',
  is_sample boolean not null default false,
  app_version text not null default '3.1',
  schema_version integer not null default 2,
  payload jsonb not null default '{}'::jsonb,
  record_created_at timestamptz not null,
  record_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint records_type_check check (
    type in ('feeding', 'burp', 'diaper', 'sleep', 'wake', 'custom', 'test')
  ),
  constraint records_amount_check check (
    amount is null or amount >= 0
  ),
  constraint records_user_record_unique unique (user_id, record_id)
);

alter table public.records enable row level security;

drop policy if exists "Users can select own records" on public.records;
drop policy if exists "Users can insert own records" on public.records;
drop policy if exists "Users can update own records" on public.records;
drop policy if exists "Users can delete own records" on public.records;

create policy "Users can select own records"
on public.records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own records"
on public.records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own records"
on public.records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own records"
on public.records
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists idx_records_user_created
on public.records (user_id, record_created_at desc);

create index if not exists idx_records_user_updated
on public.records (user_id, record_updated_at desc);

create index if not exists idx_records_user_type
on public.records (user_id, type);

create index if not exists idx_records_user_deleted
on public.records (user_id, deleted_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_records_set_updated_at on public.records;

create trigger trg_records_set_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

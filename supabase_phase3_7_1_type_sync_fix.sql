-- 아기 생활 기록 앱 — Phase 3.7.1 type/subtype 서버 동기화 오류 수정
-- 목적:
-- 1. feeding/diaper는 저장되지만 burp/sleep_start/wake가 실패하는 문제 확인
-- 2. records_type_check / records_subtype_check를 현재 앱 표준값에 맞게 정리
-- 3. 기존 records 삭제 없이 안전하게 보강
--
-- 주의:
-- 기존 테이블 drop 금지
-- 기존 records 삭제 금지
-- service_role key를 클라이언트에 넣지 않는다.
-- Direct connection string을 클라이언트에서 사용하지 않는다.

-- 1. 현재 records 관련 check constraint 확인용
select
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on c.conrelid = t.oid
join pg_namespace n on t.relnamespace = n.oid
where n.nspname = 'public'
  and t.relname = 'records'
  and c.contype = 'c'
order by conname;

-- 2. 현재 records 컬럼 확인용
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'records'
order by ordinal_position;

-- 3. 현재 저장된 type/subtype 분포 확인용
select
  type,
  subtype,
  count(*) as count
from public.records
group by type, subtype
order by type, subtype;

-- 4. records_type_check 안전 재생성
alter table public.records
drop constraint if exists records_type_check;

alter table public.records
add constraint records_type_check check (
  type in (
    'feeding',
    'burp',
    'diaper',
    'sleep_start',
    'sleep_end',
    'wake',
    'custom',
    'test'
  )
);

-- 5. records_subtype_check 안전 재생성
alter table public.records
drop constraint if exists records_subtype_check;

alter table public.records
add constraint records_subtype_check check (
  subtype is null
  or subtype in (
    'pee',
    'poop',
    'pee_poop',
    'formula',
    'breast',
    'pumped',
    'connection'
  )
);

-- 6. amount_ml 확인
alter table public.records
drop constraint if exists records_amount_ml_check;

alter table public.records
add constraint records_amount_ml_check check (
  amount_ml is null or amount_ml >= 0
);

-- 7. 동기화 조회 성능 보강
create index if not exists idx_records_family_baby_type
on public.records (family_id, baby_id, type);

create index if not exists idx_records_family_baby_client
on public.records (family_id, baby_id, client_id);

create index if not exists idx_records_deleted
on public.records (deleted_at);

-- 8. SQL 적용 후 확인용
select
  type,
  subtype,
  count(*) as count
from public.records
group by type, subtype
order by type, subtype;

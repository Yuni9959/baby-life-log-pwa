-- Baby Life Log - Phase 3.7.2 records type/subtype constraint fix
-- Run this in Supabase SQL Editor.
-- Purpose:
-- 1. Confirm current records check constraints.
-- 2. Align records_type_check / records_subtype_check with app mapping values.
-- 3. Ensure empty subtype is stored as null and non-feeding amount_ml is null.

-- Current records check constraints.
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

-- Current stored type/subtype distribution.
select
  type,
  subtype,
  count(*) as record_count
from public.records
group by type, subtype
order by type, subtype;

-- Normalize existing rows before tightening subtype behavior.
update public.records
set subtype = null
where subtype = '';

update public.records
set amount_ml = null,
    amount = null
where type <> 'feeding';

-- App/server type mapping:
-- local feeding -> feeding
-- local burp -> burp
-- local diaper -> diaper
-- local sleep -> sleep_start
-- local wake -> wake
-- local test -> test
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

-- App/server subtype mapping:
-- feeding: formula, breast, pumped
-- diaper: pee, poop, pee_poop
-- test: connection
-- burp/sleep_start/wake/custom: null
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

alter table public.records
drop constraint if exists records_amount_ml_check;

alter table public.records
add constraint records_amount_ml_check check (
  amount_ml is null or amount_ml >= 0
);

-- Verify updated constraints.
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

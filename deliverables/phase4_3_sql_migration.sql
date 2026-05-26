-- Phase 4.3 cloud context hardening.
-- records and babies are owned by family_id. OAuth identities only grant access.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_code text not null,
  provider text null,
  email text null,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz null
);

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists account_code text,
  add column if not exists provider text,
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz null;

alter table public.families
  add column if not exists family_code text,
  add column if not exists name text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.family_members
  add column if not exists role text not null default 'owner',
  add column if not exists status text not null default 'active',
  add column if not exists joined_at timestamptz null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz null;

update public.families
set name = coalesce(nullif(name, ''), '우리 가족')
where name is null or name = '';

create unique index if not exists profiles_user_id_key
  on public.profiles (user_id);

create unique index if not exists profiles_account_code_key
  on public.profiles (account_code)
  where account_code is not null;

create unique index if not exists families_family_code_key
  on public.families (family_code)
  where family_code is not null;

create unique index if not exists family_members_family_user_key
  on public.family_members (family_id, user_id);

do $$
begin
  if not exists (
    select 1
    from public.records
    where family_id is not null and client_id is not null
    group by family_id, client_id
    having count(*) > 1
  ) then
    execute 'create unique index if not exists records_family_client_id_key on public.records (family_id, client_id) where family_id is not null and client_id is not null';
  else
    raise notice 'records_family_client_id_key skipped because duplicate family_id/client_id rows exist';
  end if;

  if not exists (
    select 1
    from public.records
    where family_id is not null and record_id is not null
    group by family_id, record_id
    having count(*) > 1
  ) then
    execute 'create unique index if not exists records_family_record_id_key on public.records (family_id, record_id) where family_id is not null and record_id is not null';
  else
    raise notice 'records_family_record_id_key skipped because duplicate family_id/record_id rows exist';
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.records enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists families_select_authenticated_phase4_3 on public.families;
create policy families_select_authenticated_phase4_3
on public.families for select
to authenticated
using (auth.uid() is not null);

drop policy if exists families_insert_authenticated_phase4_3 on public.families;
create policy families_insert_authenticated_phase4_3
on public.families for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists families_update_members_phase4_3 on public.families;
create policy families_update_members_phase4_3
on public.families for update
to authenticated
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
)
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists family_members_select_own_phase4_3 on public.family_members;
create policy family_members_select_own_phase4_3
on public.family_members for select
to authenticated
using (user_id = auth.uid());

drop policy if exists family_members_insert_self_phase4_3 on public.family_members;
create policy family_members_insert_self_phase4_3
on public.family_members for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists family_members_update_self_phase4_3 on public.family_members;
create policy family_members_update_self_phase4_3
on public.family_members for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists babies_select_family_members_phase4_3 on public.babies;
create policy babies_select_family_members_phase4_3
on public.babies for select
to authenticated
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = babies.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists babies_insert_family_members_phase4_3 on public.babies;
create policy babies_insert_family_members_phase4_3
on public.babies for insert
to authenticated
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = babies.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists babies_update_family_members_phase4_3 on public.babies;
create policy babies_update_family_members_phase4_3
on public.babies for update
to authenticated
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = babies.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
)
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = babies.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists records_select_family_members_phase4_3 on public.records;
create policy records_select_family_members_phase4_3
on public.records for select
to authenticated
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = records.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists records_insert_family_members_phase4_3 on public.records;
create policy records_insert_family_members_phase4_3
on public.records for insert
to authenticated
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = records.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

drop policy if exists records_update_family_members_phase4_3 on public.records;
create policy records_update_family_members_phase4_3
on public.records for update
to authenticated
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = records.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
)
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = records.family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  )
);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.families to authenticated;
grant select, insert, update on public.family_members to authenticated;
grant select, insert, update on public.babies to authenticated;
grant select, insert, update on public.records to authenticated;

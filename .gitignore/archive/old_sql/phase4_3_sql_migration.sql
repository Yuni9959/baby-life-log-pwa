-- Phase 4.3 Family Identity & Cloud Backup Foundation
-- OAuth identity is only an access layer.
-- The true owner of records is the family workspace.
-- OAuth 계정은 접근 권한 계층일 뿐이며, records의 실제 owner는 family workspace다.

begin;

create extension if not exists pgcrypto;

create or replace function public.phase4_3_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.phase4_3_random_code(p_prefix text)
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  output text := '';
  bytes bytea := gen_random_bytes(8);
  i int;
begin
  for i in 0..7 loop
    output := output || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return upper(p_prefix) || '-' || substr(output, 1, 4) || '-' || substr(output, 5, 4);
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_code text not null,
  provider text,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint profiles_account_code_format check (account_code ~ '^ACCT-[A-Z0-9]{4}-[A-Z0-9]{4}$')
);

alter table public.profiles
  add column if not exists account_code text,
  add column if not exists provider text,
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz default now();

create unique index if not exists profiles_user_id_key on public.profiles(user_id);
create unique index if not exists profiles_account_code_key on public.profiles(account_code);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.phase4_3_touch_updated_at();

alter table public.families
  add column if not exists family_code text,
  add column if not exists name text,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists families_family_code_key on public.families(family_code);
create index if not exists families_family_code_lookup_idx on public.families((upper(family_code)));

drop trigger if exists trg_families_updated_at on public.families;
create trigger trg_families_updated_at
before update on public.families
for each row execute function public.phase4_3_touch_updated_at();

create or replace function public.phase4_3_set_family_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.family_code is not null and trim(new.family_code) <> '' then
    new.family_code := upper(trim(new.family_code));
    return new;
  end if;

  loop
    candidate := public.phase4_3_random_code('FAM');
    exit when not exists (
      select 1 from public.families f where f.family_code = candidate
    );
  end loop;
  new.family_code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_families_set_family_code on public.families;
create trigger trg_families_set_family_code
before insert or update of family_code on public.families
for each row execute function public.phase4_3_set_family_code();

alter table public.family_members
  add column if not exists status text default 'active',
  add column if not exists joined_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.family_members set status = 'active' where status is null;
update public.family_members set joined_at = coalesce(joined_at, created_at, now()) where joined_at is null;
update public.family_members set last_seen_at = coalesce(last_seen_at, updated_at, joined_at, now()) where last_seen_at is null;
update public.family_members set role = 'parent' where role is null or role = 'member';

alter table public.family_members
  drop constraint if exists family_members_role_check;

alter table public.family_members
  add constraint family_members_role_check
  check (role in ('owner', 'parent', 'caregiver', 'viewer'));

create unique index if not exists family_members_family_user_key
  on public.family_members(family_id, user_id);

create index if not exists family_members_user_status_idx
  on public.family_members(user_id, status);

create index if not exists family_members_family_status_idx
  on public.family_members(family_id, status);

create unique index if not exists records_family_baby_client_key
  on public.records(family_id, baby_id, client_id)
  where family_id is not null and baby_id is not null and client_id is not null;

create index if not exists records_family_recorded_at_idx
  on public.records(family_id, recorded_at desc);

create or replace function public.is_current_family_member(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  );
$$;

create or replace function public.ensure_current_profile(
  p_account_code text default null,
  p_provider text default null,
  p_email text default null,
  p_display_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_profile public.profiles;
  candidate text;
begin
  if current_user_id is null then
    raise exception 'auth user is required';
  end if;

  select * into existing_profile
  from public.profiles
  where user_id = current_user_id;

  if existing_profile.id is not null then
    update public.profiles
       set provider = coalesce(nullif(p_provider, ''), provider),
           email = coalesce(nullif(p_email, ''), email),
           display_name = coalesce(nullif(p_display_name, ''), display_name),
           last_seen_at = now()
     where id = existing_profile.id
     returning * into existing_profile;
    return existing_profile;
  end if;

  loop
    candidate := coalesce(nullif(upper(trim(p_account_code)), ''), public.phase4_3_random_code('ACCT'));
    exit when candidate ~ '^ACCT-[A-Z0-9]{4}-[A-Z0-9]{4}$'
      and not exists (select 1 from public.profiles p where p.account_code = candidate);
    p_account_code := null;
  end loop;

  insert into public.profiles(user_id, account_code, provider, email, display_name, last_seen_at)
  values (current_user_id, candidate, nullif(p_provider, ''), nullif(p_email, ''), nullif(p_display_name, ''), now())
  returning * into existing_profile;

  return existing_profile;
end;
$$;

create or replace function public.ensure_family_code(
  p_family_id uuid,
  p_family_code text default null
)
returns table(family_id uuid, family_code text, family_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  if p_family_id is null then
    raise exception 'family_id is required';
  end if;

  if not public.is_current_family_member(p_family_id) then
    raise exception 'not a member of this family';
  end if;

  select f.family_code into candidate
  from public.families f
  where f.id = p_family_id;

  if candidate is null or trim(candidate) = '' then
    loop
      candidate := coalesce(nullif(upper(trim(p_family_code)), ''), public.phase4_3_random_code('FAM'));
      exit when candidate ~ '^FAM-[A-Z0-9]{4}-[A-Z0-9]{4}$'
        and not exists (select 1 from public.families f where f.family_code = candidate and f.id <> p_family_id);
      p_family_code := null;
    end loop;

    update public.families
       set family_code = candidate
     where id = p_family_id;
  end if;

  return query
  select f.id, f.family_code, f.name
  from public.families f
  where f.id = p_family_id;
end;
$$;

create or replace function public.link_current_user_to_family(
  p_family_id uuid,
  p_provider text default null
)
returns public.family_members
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  member public.family_members;
  existing_count int;
  family_creator uuid;
  next_role text := 'parent';
begin
  if current_user_id is null then
    raise exception 'auth user is required';
  end if;
  if p_family_id is null then
    raise exception 'family_id is required';
  end if;

  select count(*) into existing_count
  from public.family_members fm
  where fm.family_id = p_family_id;

  select created_by into family_creator
  from public.families
  where id = p_family_id;

  if existing_count = 0 and family_creator = current_user_id then
    next_role := 'owner';
  end if;

  insert into public.family_members(family_id, user_id, role, status, joined_at, last_seen_at)
  values (p_family_id, current_user_id, next_role, 'active', now(), now())
  on conflict (family_id, user_id) do update
    set status = 'active',
        last_seen_at = now()
  returning * into member;

  return member;
end;
$$;

create or replace function public.join_family_by_family_code(
  p_family_code text,
  p_device_id text default null,
  p_device_name text default null,
  p_device_type text default null
)
returns table(
  family_id uuid,
  family_code text,
  family_name text,
  baby_id uuid,
  baby_name text,
  baby_birth_date date,
  baby_gender text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(p_family_code, '')));
  target_family public.families;
  target_baby public.babies;
begin
  if current_user_id is null then
    raise exception 'auth user is required';
  end if;
  if normalized_code = '' then
    raise exception 'family_code is required';
  end if;

  select * into target_family
  from public.families f
  where upper(f.family_code) = normalized_code;

  if target_family.id is null then
    raise exception 'family not found';
  end if;

  insert into public.family_members(family_id, user_id, role, status, joined_at, last_seen_at)
  values (target_family.id, current_user_id, 'parent', 'active', now(), now())
  on conflict (family_id, user_id) do update
    set status = 'active',
        last_seen_at = now();

  select * into target_baby
  from public.babies b
  where b.family_id = target_family.id
  order by b.created_at asc
  limit 1;

  if target_baby.id is null then
    insert into public.babies(family_id, name, gender)
    values (target_family.id, '아기', 'unknown')
    returning * into target_baby;
  end if;

  if p_device_id is not null and trim(p_device_id) <> '' and to_regclass('public.devices') is not null then
    insert into public.devices(family_id, user_id, device_id, device_name, device_type, last_seen_at)
    values (target_family.id, current_user_id, p_device_id, p_device_name, p_device_type, now())
    on conflict (device_id) do update
      set family_id = excluded.family_id,
          user_id = excluded.user_id,
          device_name = excluded.device_name,
          device_type = excluded.device_type,
          last_seen_at = now();
  end if;

  return query
  select target_family.id, target_family.family_code, target_family.name,
         target_baby.id, target_baby.name, target_baby.birth_date, target_baby.gender;
end;
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.records enable row level security;
alter table public.babies enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select using (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists families_select_members on public.families;
create policy families_select_members on public.families
for select using (public.is_current_family_member(id));

drop policy if exists family_members_select_members on public.family_members;
create policy family_members_select_members on public.family_members
for select using (user_id = auth.uid() or public.is_current_family_member(family_id));

drop policy if exists babies_select_family_members on public.babies;
create policy babies_select_family_members on public.babies
for select using (public.is_current_family_member(family_id));

drop policy if exists babies_insert_family_members on public.babies;
create policy babies_insert_family_members on public.babies
for insert with check (public.is_current_family_member(family_id));

drop policy if exists babies_update_family_members on public.babies;
create policy babies_update_family_members on public.babies
for update using (public.is_current_family_member(family_id))
with check (public.is_current_family_member(family_id));

drop policy if exists records_select_family_members on public.records;
create policy records_select_family_members on public.records
for select using (public.is_current_family_member(family_id));

drop policy if exists records_insert_family_members on public.records;
create policy records_insert_family_members on public.records
for insert with check (public.is_current_family_member(family_id));

drop policy if exists records_update_family_members on public.records;
create policy records_update_family_members on public.records
for update using (public.is_current_family_member(family_id))
with check (public.is_current_family_member(family_id));

grant select on public.profiles to authenticated;
grant select on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update on public.records to authenticated;
grant select, insert, update on public.babies to authenticated;
grant execute on function public.ensure_current_profile(text, text, text, text) to authenticated;
grant execute on function public.ensure_family_code(uuid, text) to authenticated;
grant execute on function public.link_current_user_to_family(uuid, text) to authenticated;
grant execute on function public.join_family_by_family_code(text, text, text, text) to authenticated;

-- Backfill existing rows after functions and uniqueness are ready.
do $$
declare
  family_row record;
  candidate text;
begin
  for family_row in
    select id from public.families where family_code is null
  loop
    loop
      candidate := public.phase4_3_random_code('FAM');
      exit when not exists (
        select 1 from public.families f where f.family_code = candidate
      );
    end loop;
    update public.families set family_code = candidate where id = family_row.id;
  end loop;
end;
$$;

commit;

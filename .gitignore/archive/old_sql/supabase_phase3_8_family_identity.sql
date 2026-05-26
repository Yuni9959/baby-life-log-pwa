-- Phase 3.8 Family Identity & Multi-Device Foundation
-- Run this in the Supabase SQL Editor after Phase 3.7.1 migrations.
-- This migration is additive and does not delete existing records.

create extension if not exists pgcrypto;

alter table public.families
  add column if not exists access_code text,
  add column if not exists created_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'families_access_code_format_chk'
      and conrelid = 'public.families'::regclass
  ) then
    alter table public.families
      add constraint families_access_code_format_chk
      check (access_code is null or access_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$|^FAMILY-[A-Z0-9]{6}$')
      not valid;
  end if;
end;
$$;

create unique index if not exists families_access_code_key
  on public.families (access_code)
  where access_code is not null;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid,
  device_id text not null,
  device_name text not null default 'Device',
  device_type text not null default 'device',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devices
  add column if not exists family_id uuid,
  add column if not exists user_id uuid,
  add column if not exists device_id text,
  add column if not exists device_name text default 'Device',
  add column if not exists device_type text default 'device',
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists devices_device_id_key
  on public.devices (device_id);

create index if not exists devices_family_id_last_seen_idx
  on public.devices (family_id, last_seen_at desc);

create index if not exists devices_user_id_idx
  on public.devices (user_id);

create unique index if not exists records_family_client_id_key
  on public.records (family_id, client_id)
  where family_id is not null and client_id is not null and deleted_at is null;

create index if not exists records_family_recorded_at_idx
  on public.records (family_id, recorded_at);

create unique index if not exists family_members_family_user_key
  on public.family_members (family_id, user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create or replace function public.generate_family_access_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

create or replace function public.ensure_family_access_code(p_family_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
  tries int := 0;
begin
  if p_family_id is null then
    raise exception 'family_id is required';
  end if;

  select access_code into next_code
  from public.families
  where id = p_family_id;

  if next_code is not null then
    return next_code;
  end if;

  loop
    tries := tries + 1;
    next_code := public.generate_family_access_code();
    begin
      update public.families
      set access_code = next_code
      where id = p_family_id and access_code is null;

      select access_code into next_code
      from public.families
      where id = p_family_id;

      if next_code is not null then
        return next_code;
      end if;
    exception when unique_violation then
      if tries >= 25 then
        raise exception 'could not generate unique family access code';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.backfill_family_access_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  family_row record;
  changed_count integer := 0;
begin
  for family_row in
    select id from public.families where access_code is null
  loop
    perform public.ensure_family_access_code(family_row.id);
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end;
$$;

select public.backfill_family_access_codes();

create or replace function public.create_family_with_access_code(
  p_family_name text default 'Family',
  p_baby_name text default 'Baby',
  p_baby_birth_date date default null,
  p_baby_gender text default 'unknown',
  p_device_id text default null,
  p_device_name text default 'Device',
  p_device_type text default 'device'
)
returns table (
  family_id uuid,
  family_name text,
  access_code text,
  baby_id uuid,
  baby_name text,
  baby_birth_date date,
  baby_gender text,
  device_row_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_family public.families%rowtype;
  created_baby public.babies%rowtype;
  created_access_code text;
  upserted_device_id uuid;
begin
  if current_user_id is null then
    raise exception 'anonymous auth is required';
  end if;

  insert into public.families (name, created_by)
  values (coalesce(nullif(trim(p_family_name), ''), 'Family'), current_user_id)
  returning * into created_family;

  created_access_code := public.ensure_family_access_code(created_family.id);

  insert into public.family_members (family_id, user_id, role)
  values (created_family.id, current_user_id, 'owner')
  on conflict (family_id, user_id) do update
    set role = 'owner';

  insert into public.babies (family_id, name, birth_date, gender)
  values (
    created_family.id,
    coalesce(nullif(trim(p_baby_name), ''), 'Baby'),
    p_baby_birth_date,
    coalesce(nullif(trim(p_baby_gender), ''), 'unknown')
  )
  returning * into created_baby;

  if nullif(trim(coalesce(p_device_id, '')), '') is not null then
    insert into public.devices (
      family_id, user_id, device_id, device_name, device_type, last_seen_at
    )
    values (
      created_family.id,
      current_user_id,
      nullif(trim(p_device_id), ''),
      coalesce(nullif(trim(p_device_name), ''), 'Device'),
      coalesce(nullif(trim(p_device_type), ''), 'device'),
      now()
    )
    on conflict (device_id) do update
      set family_id = excluded.family_id,
          user_id = excluded.user_id,
          device_name = excluded.device_name,
          device_type = excluded.device_type,
          last_seen_at = now(),
          updated_at = now()
    returning id into upserted_device_id;
  end if;

  return query
  select
    created_family.id,
    created_family.name,
    created_access_code,
    created_baby.id,
    created_baby.name,
    created_baby.birth_date,
    created_baby.gender,
    upserted_device_id;
end;
$$;

create or replace function public.join_family_by_access_code(
  p_access_code text,
  p_device_id text,
  p_device_name text default 'Device',
  p_device_type text default 'device'
)
returns table (
  family_id uuid,
  family_name text,
  access_code text,
  baby_id uuid,
  baby_name text,
  baby_birth_date date,
  baby_gender text,
  device_row_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_family public.families%rowtype;
  target_baby public.babies%rowtype;
  current_user_id uuid := auth.uid();
  upserted_device_id uuid;
begin
  if current_user_id is null then
    raise exception 'anonymous auth is required';
  end if;

  normalized_code := upper(regexp_replace(coalesce(p_access_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(normalized_code) = 8 then
    normalized_code := substr(normalized_code, 1, 4) || '-' || substr(normalized_code, 5, 4);
  elsif left(normalized_code, 6) = 'FAMILY' and length(normalized_code) >= 12 then
    normalized_code := 'FAMILY-' || substr(normalized_code, 7, 6);
  end if;

  select * into target_family
  from public.families
  where access_code = normalized_code;

  if target_family.id is null then
    raise exception 'family access code not found';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (target_family.id, current_user_id, 'member')
  on conflict (family_id, user_id) do update
    set role = coalesce(public.family_members.role, excluded.role);

  select * into target_baby
  from public.babies
  where family_id = target_family.id
  order by created_at asc
  limit 1;

  if target_baby.id is null then
    insert into public.babies (family_id, name, gender)
    values (target_family.id, 'Baby', 'unknown')
    returning * into target_baby;
  end if;

  insert into public.devices (
    family_id, user_id, device_id, device_name, device_type, last_seen_at
  )
  values (
    target_family.id,
    current_user_id,
    nullif(trim(p_device_id), ''),
    coalesce(nullif(trim(p_device_name), ''), 'Device'),
    coalesce(nullif(trim(p_device_type), ''), 'device'),
    now()
  )
  on conflict (device_id) do update
    set family_id = excluded.family_id,
        user_id = excluded.user_id,
        device_name = excluded.device_name,
        device_type = excluded.device_type,
        last_seen_at = now(),
        updated_at = now()
  returning id into upserted_device_id;

  return query
  select
    target_family.id,
    target_family.name,
    target_family.access_code,
    target_baby.id,
    target_baby.name,
    target_baby.birth_date,
    target_baby.gender,
    upserted_device_id;
end;
$$;

create or replace function public.upsert_device(
  p_family_id uuid,
  p_device_id text,
  p_device_name text default 'Device',
  p_device_type text default 'device'
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  device_row public.devices%rowtype;
begin
  if current_user_id is null then
    raise exception 'anonymous auth is required';
  end if;

  if p_family_id is null or nullif(trim(coalesce(p_device_id, '')), '') is null then
    raise exception 'family_id and device_id are required';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = current_user_id
  ) then
    raise exception 'family membership is required';
  end if;

  insert into public.devices (
    family_id, user_id, device_id, device_name, device_type, last_seen_at
  )
  values (
    p_family_id,
    current_user_id,
    trim(p_device_id),
    coalesce(nullif(trim(p_device_name), ''), 'Device'),
    coalesce(nullif(trim(p_device_type), ''), 'device'),
    now()
  )
  on conflict (device_id) do update
    set family_id = excluded.family_id,
        user_id = excluded.user_id,
        device_name = excluded.device_name,
        device_type = excluded.device_type,
        last_seen_at = now(),
        updated_at = now()
  returning * into device_row;

  return device_row;
end;
$$;

create or replace function public.get_linked_devices(p_family_id uuid)
returns table (
  id uuid,
  family_id uuid,
  user_id uuid,
  device_id text,
  device_name text,
  device_type text,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select d.id, d.family_id, d.user_id, d.device_id, d.device_name, d.device_type,
         d.last_seen_at, d.created_at, d.updated_at
  from public.devices d
  where d.family_id = p_family_id
    and exists (
      select 1
      from public.family_members fm
      where fm.family_id = d.family_id
        and fm.user_id = auth.uid()
    )
  order by d.last_seen_at desc;
$$;

create or replace function public.keep_latest_record_update()
returns trigger
language plpgsql
as $$
declare
  old_client_updated timestamptz;
  new_client_updated timestamptz;
begin
  old_client_updated := nullif(old.payload ->> 'updatedAt', '')::timestamptz;
  new_client_updated := nullif(new.payload ->> 'updatedAt', '')::timestamptz;

  if old_client_updated is not null and new_client_updated is not null and old_client_updated > new_client_updated then
    return old;
  end if;

  new.updated_at = now();
  return new;
exception when others then
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists records_keep_latest_update on public.records;
create trigger records_keep_latest_update
before update on public.records
for each row execute function public.keep_latest_record_update();

alter table public.families enable row level security;
alter table public.devices enable row level security;

drop policy if exists devices_select_family_members on public.devices;
create policy devices_select_family_members
on public.devices for select
using (
  user_id = auth.uid()
  or
  exists (
    select 1 from public.family_members fm
    where fm.family_id = devices.family_id
      and fm.user_id = auth.uid()
  )
);

drop policy if exists devices_insert_self on public.devices;
create policy devices_insert_self
on public.devices for insert
with check (user_id = auth.uid());

drop policy if exists devices_update_self_or_family_member on public.devices;
create policy devices_update_self_or_family_member
on public.devices for update
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.family_members fm
    where fm.family_id = devices.family_id
      and fm.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.family_members fm
    where fm.family_id = devices.family_id
      and fm.user_id = auth.uid()
  )
);

drop policy if exists families_select_own_membership on public.families;
create policy families_select_own_membership
on public.families for select
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id
      and fm.user_id = auth.uid()
  )
);

drop policy if exists families_insert_own_anonymous on public.families;
create policy families_insert_own_anonymous
on public.families for insert
with check (created_by is null or created_by = auth.uid());

drop policy if exists records_select_family_members on public.records;
create policy records_select_family_members
on public.records for select
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = records.family_id
      and fm.user_id = auth.uid()
  )
);

grant execute on function public.ensure_family_access_code(uuid) to anon, authenticated;
grant execute on function public.create_family_with_access_code(text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.join_family_by_access_code(text, text, text, text) to anon, authenticated;
grant execute on function public.upsert_device(uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_linked_devices(uuid) to anon, authenticated;
grant select, insert, update on public.devices to anon, authenticated;
grant select on public.families to anon, authenticated;

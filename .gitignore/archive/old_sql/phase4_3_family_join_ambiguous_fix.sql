-- Phase 4.3 family join ambiguous family_id fix
-- Run this in the Supabase SQL Editor.
-- This migration does not create a new family, does not clear localStorage,
-- and keeps records owned by records.family_id + records.baby_id.

begin;

create or replace function public.is_current_family_member(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.family_members as fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and coalesce(fm.status, 'active') = 'active'
  );
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
  v_target_family_id uuid := p_family_id;
  v_candidate text;
begin
  if v_target_family_id is null then
    raise exception 'family_id is required';
  end if;

  if not public.is_current_family_member(v_target_family_id) then
    raise exception 'not a member of this family';
  end if;

  select f.family_code
    into v_candidate
  from public.families as f
  where f.id = v_target_family_id;

  if v_candidate is null or trim(v_candidate) = '' then
    loop
      v_candidate := coalesce(nullif(upper(trim(p_family_code)), ''), public.phase4_3_random_code('FAM'));
      exit when v_candidate ~ '^FAM-[A-Z0-9]{4}-[A-Z0-9]{4}$'
        and not exists (
          select 1
          from public.families as f
          where f.family_code = v_candidate
            and f.id <> v_target_family_id
        );
      p_family_code := null;
    end loop;

    update public.families as f
       set family_code = v_candidate
     where f.id = v_target_family_id;
  end if;

  return query
  select f.id as family_id,
         f.family_code as family_code,
         f.name as family_name
  from public.families as f
  where f.id = v_target_family_id;
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
  v_current_user_id uuid := auth.uid();
  v_target_family_id uuid := p_family_id;
  v_member public.family_members;
  v_existing_count int := 0;
  v_next_role text := 'parent';
begin
  if v_current_user_id is null then
    raise exception 'auth user is required';
  end if;
  if v_target_family_id is null then
    raise exception 'family_id is required';
  end if;

  select count(*)
    into v_existing_count
  from public.family_members as fm
  where fm.family_id = v_target_family_id;

  if v_existing_count = 0 then
    v_next_role := 'owner';
  end if;

  update public.family_members as fm
     set status = 'active',
         last_seen_at = now(),
         updated_at = now()
   where fm.family_id = v_target_family_id
     and fm.user_id = v_current_user_id
   returning fm.* into v_member;

  if v_member.id is null then
    begin
      insert into public.family_members as fm (
        family_id, user_id, role, status, joined_at, last_seen_at
      )
      values (
        v_target_family_id, v_current_user_id, v_next_role, 'active', now(), now()
      )
      returning fm.* into v_member;
    exception when unique_violation then
      update public.family_members as fm
         set status = 'active',
             last_seen_at = now(),
             updated_at = now()
       where fm.family_id = v_target_family_id
         and fm.user_id = v_current_user_id
       returning fm.* into v_member;
    end;
  end if;

  return v_member;
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
  v_current_user_id uuid := auth.uid();
  v_normalized_code text := upper(trim(coalesce(p_family_code, '')));
  v_target_family_id uuid;
  v_target_family_code text;
  v_target_family_name text;
  v_target_baby_id uuid;
  v_target_baby_name text;
  v_target_baby_birth_date date;
  v_target_baby_gender text;
  v_member public.family_members;
begin
  if v_current_user_id is null then
    raise exception 'auth user is required';
  end if;
  if v_normalized_code = '' then
    raise exception 'family_code is required';
  end if;

  select f.id,
         f.family_code,
         f.name
    into v_target_family_id,
         v_target_family_code,
         v_target_family_name
  from public.families as f
  where upper(f.family_code) = v_normalized_code
  limit 1;

  if v_target_family_id is null then
    raise exception 'family not found';
  end if;

  update public.family_members as fm
     set status = 'active',
         last_seen_at = now(),
         updated_at = now()
   where fm.family_id = v_target_family_id
     and fm.user_id = v_current_user_id
   returning fm.* into v_member;

  if v_member.id is null then
    begin
      insert into public.family_members as fm (
        family_id, user_id, role, status, joined_at, last_seen_at
      )
      values (
        v_target_family_id, v_current_user_id, 'parent', 'active', now(), now()
      )
      returning fm.* into v_member;
    exception when unique_violation then
      update public.family_members as fm
         set status = 'active',
             last_seen_at = now(),
             updated_at = now()
       where fm.family_id = v_target_family_id
         and fm.user_id = v_current_user_id
       returning fm.* into v_member;
    end;
  end if;

  select b.id,
         b.name,
         b.birth_date,
         b.gender
    into v_target_baby_id,
         v_target_baby_name,
         v_target_baby_birth_date,
         v_target_baby_gender
  from public.babies as b
  where b.family_id = v_target_family_id
  order by b.created_at asc
  limit 1;

  if v_target_baby_id is null then
    insert into public.babies as b (
      family_id, name, gender
    )
    values (
      v_target_family_id, 'Baby', 'unknown'
    )
    returning b.id, b.name, b.birth_date, b.gender
      into v_target_baby_id, v_target_baby_name, v_target_baby_birth_date, v_target_baby_gender;
  end if;

  if p_device_id is not null
    and trim(p_device_id) <> ''
    and to_regclass('public.devices') is not null
  then
    insert into public.devices as d (
      family_id, user_id, device_id, device_name, device_type, last_seen_at
    )
    values (
      v_target_family_id,
      v_current_user_id,
      p_device_id,
      p_device_name,
      p_device_type,
      now()
    )
    on conflict (device_id) do update
      set family_id = excluded.family_id,
          user_id = excluded.user_id,
          device_name = excluded.device_name,
          device_type = excluded.device_type,
          last_seen_at = now();
  end if;

  return query
  select v_target_family_id as family_id,
         v_target_family_code as family_code,
         v_target_family_name as family_name,
         v_target_baby_id as baby_id,
         v_target_baby_name as baby_name,
         v_target_baby_birth_date as baby_birth_date,
         v_target_baby_gender as baby_gender;
end;
$$;

drop policy if exists families_select_members on public.families;
create policy families_select_members on public.families
for select using (public.is_current_family_member(families.id));

drop policy if exists family_members_select_members on public.family_members;
create policy family_members_select_members on public.family_members
for select using (
  family_members.user_id = auth.uid()
  or public.is_current_family_member(family_members.family_id)
);

drop policy if exists babies_select_family_members on public.babies;
create policy babies_select_family_members on public.babies
for select using (public.is_current_family_member(babies.family_id));

drop policy if exists babies_insert_family_members on public.babies;
create policy babies_insert_family_members on public.babies
for insert with check (public.is_current_family_member(babies.family_id));

drop policy if exists babies_update_family_members on public.babies;
create policy babies_update_family_members on public.babies
for update using (public.is_current_family_member(babies.family_id))
with check (public.is_current_family_member(babies.family_id));

drop policy if exists records_select_family_members on public.records;
create policy records_select_family_members on public.records
for select using (public.is_current_family_member(records.family_id));

drop policy if exists records_insert_family_members on public.records;
create policy records_insert_family_members on public.records
for insert with check (public.is_current_family_member(records.family_id));

drop policy if exists records_update_family_members on public.records;
create policy records_update_family_members on public.records
for update using (public.is_current_family_member(records.family_id))
with check (public.is_current_family_member(records.family_id));

grant execute on function public.ensure_family_code(uuid, text) to anon, authenticated;
grant execute on function public.link_current_user_to_family(uuid, text) to anon, authenticated;
grant execute on function public.join_family_by_family_code(text, text, text, text) to anon, authenticated;

commit;

-- Phase 4.0 Auth Identity Foundation
-- records와 babies의 실제 주인은 auth user가 아니라 family_id다.
-- The owner of records and babies is the family_id, not the auth user.
--
-- This migration is additive and idempotent. It does not change records,
-- babies, or settings ownership away from family_id.

create extension if not exists pgcrypto;

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'parent',
  status text not null default 'active',
  joined_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_seen_at timestamptz
);

alter table public.family_members
  add column if not exists status text default 'active',
  add column if not exists joined_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz;

alter table public.family_members
  alter column role set default 'parent',
  alter column status set default 'active';

update public.family_members
set role = case
  when role is null then 'parent'
  when role = 'caregiver' then 'parent'
  when role = 'member' then 'viewer'
  else role
end,
status = coalesce(status, 'active'),
joined_at = coalesce(joined_at, created_at, now()),
updated_at = coalesce(updated_at, created_at, now());

alter table public.family_members
  alter column role set not null,
  alter column status set not null;

create unique index if not exists family_members_family_user_key
  on public.family_members (family_id, user_id);

create index if not exists family_members_user_status_idx
  on public.family_members (user_id, status);

create index if not exists family_members_family_status_idx
  on public.family_members (family_id, status);

alter table public.family_members
  drop constraint if exists family_members_role_check;

alter table public.family_members
  add constraint family_members_role_check
  check (role in ('owner', 'parent', 'viewer'));

alter table public.family_members
  drop constraint if exists family_members_status_check;

alter table public.family_members
  add constraint family_members_status_check
  check (status in ('active', 'invited', 'removed'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_family_member_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
    new.user_id := old.user_id;
    new.role := old.role;
  end if;

  if new.role = 'caregiver' then
    new.role := 'parent';
  elsif new.role = 'member' then
    new.role := 'viewer';
  elsif new.role is null then
    new.role := 'parent';
  end if;

  if new.status is null then
    new.status := 'active';
  end if;

  if new.joined_at is null then
    new.joined_at := coalesce(new.created_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_family_members_normalize_identity on public.family_members;

create trigger trg_family_members_normalize_identity
before insert or update on public.family_members
for each row
execute function public.normalize_family_member_identity();

drop trigger if exists trg_family_members_updated_at on public.family_members;

create trigger trg_family_members_updated_at
before update on public.family_members
for each row
execute function public.set_updated_at();

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

alter table public.family_members enable row level security;

drop policy if exists "family_members_select_own_family" on public.family_members;

create policy "family_members_select_own_family"
on public.family_members
for select
using (
  user_id = auth.uid()
  or public.is_family_member(family_id)
);

drop policy if exists "family_members_insert_self" on public.family_members;

create policy "family_members_insert_self"
on public.family_members
for insert
with check (
  user_id = auth.uid()
);

drop policy if exists "family_members_update_self" on public.family_members;

create policy "family_members_update_self"
on public.family_members
for update
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and family_id is not null
  and role in ('owner', 'parent', 'viewer')
  and status in ('active', 'invited', 'removed')
);

grant select, insert, update on public.family_members to anon, authenticated;
grant execute on function public.is_family_member(uuid) to anon, authenticated;

-- records, babies, and settings must remain family-owned.
-- Never replace family_id with auth.uid().
-- Google account is only an identity for accessing the family workspace, not the owner of records.

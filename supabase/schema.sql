-- Enable UUID generation
create extension if not exists pgcrypto;

-- Core household model
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Shared list header
create table if not exists public.shared_lists (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  completed_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_lists_household_idx on public.shared_lists(household_id);

-- Shared list items
create table if not exists public.shared_list_items (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  name text not null,
  normalized text not null,
  quantity text,
  category_name text,
  checked boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_list_items_household_idx on public.shared_list_items(household_id);
create index if not exists shared_list_items_list_idx on public.shared_list_items(list_id);

-- Shared catalog/history
create table if not exists public.shared_catalog (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  normalized text not null,
  default_category_name text,
  last_purchased_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_catalog_household_idx on public.shared_catalog(household_id);

-- Shared stores/layout
create table if not exists public.shared_stores (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 50,
  category_order_names jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_stores_household_idx on public.shared_stores(household_id);

-- Per-user active shopping context, independent between household members
create table if not exists public.user_store_state (
  user_id uuid not null,
  household_id uuid not null references public.households(id) on delete cascade,
  selected_store_id uuid,
  last_detected_store_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

create index if not exists user_store_state_household_idx on public.user_store_state(household_id);

-- RLS helper
create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = auth.uid()
  );
$$;

-- Enable RLS
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shared_lists enable row level security;
alter table public.shared_list_items enable row level security;
alter table public.shared_catalog enable row level security;
alter table public.shared_stores enable row level security;
alter table public.user_store_state enable row level security;

-- households
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'households'
      and policyname = 'households_select'
  ) then
    create policy households_select on public.households
    for select using (public.is_household_member(id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'households'
      and policyname = 'households_insert'
  ) then
    create policy households_insert on public.households
    for insert with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'households'
      and policyname = 'households_update'
  ) then
    create policy households_update on public.households
    for update using (public.is_household_member(id));
  end if;
end $$;

-- household_members
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_members'
      and policyname = 'household_members_select'
  ) then
    create policy household_members_select on public.household_members
    for select using (public.is_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_members'
      and policyname = 'household_members_insert'
  ) then
    create policy household_members_insert on public.household_members
    for insert with check (public.is_household_member(household_id) or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_members'
      and policyname = 'household_members_update'
  ) then
    create policy household_members_update on public.household_members
    for update using (public.is_household_member(household_id));
  end if;
end $$;

-- shared_lists
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_lists'
      and policyname = 'shared_lists_all'
  ) then
    create policy shared_lists_all on public.shared_lists
    for all using (public.is_household_member(household_id))
    with check (public.is_household_member(household_id));
  end if;
end $$;

-- shared_list_items
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_list_items'
      and policyname = 'shared_list_items_all'
  ) then
    create policy shared_list_items_all on public.shared_list_items
    for all using (public.is_household_member(household_id))
    with check (public.is_household_member(household_id));
  end if;
end $$;

-- shared_catalog
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_catalog'
      and policyname = 'shared_catalog_all'
  ) then
    create policy shared_catalog_all on public.shared_catalog
    for all using (public.is_household_member(household_id))
    with check (public.is_household_member(household_id));
  end if;
end $$;

-- shared_stores
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_stores'
      and policyname = 'shared_stores_all'
  ) then
    create policy shared_stores_all on public.shared_stores
    for all using (public.is_household_member(household_id))
    with check (public.is_household_member(household_id));
  end if;
end $$;

-- user_store_state
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_store_state'
      and policyname = 'user_store_state_select'
  ) then
    create policy user_store_state_select on public.user_store_state
    for select using (public.is_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_store_state'
      and policyname = 'user_store_state_upsert'
  ) then
    create policy user_store_state_upsert on public.user_store_state
    for all using (user_id = auth.uid() and public.is_household_member(household_id))
    with check (user_id = auth.uid() and public.is_household_member(household_id));
  end if;
end $$;

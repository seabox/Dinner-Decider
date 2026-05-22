-- =============================================================================
-- Dinner Decider – Supabase Database Schema
-- Run this in the Supabase SQL Editor for your project.
-- =============================================================================

-- Enable UUID helpers (available by default in Supabase)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- families
-- A family is a collaboration group identified by a short shareable code.
-- ---------------------------------------------------------------------------
create table if not exists public.families (
  id         uuid        primary key default gen_random_uuid(),
  code       text        unique not null,
  name       text        not null default '',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- user_families  (many-to-many: users ↔ families)
-- ---------------------------------------------------------------------------
create table if not exists public.user_families (
  user_id    uuid        not null references auth.users(id)      on delete cascade,
  family_id  uuid        not null references public.families(id) on delete cascade,
  joined_at  timestamptz default now(),
  primary key (user_id, family_id)
);

-- ---------------------------------------------------------------------------
-- meals
-- The shared list of meals a family regularly makes.
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id         uuid        primary key default gen_random_uuid(),
  family_id  uuid        not null references public.families(id) on delete cascade,
  name       text        not null,
  reference  text        not null default '',   -- e.g. book title or website URL
  style      text        not null default '',   -- e.g. Indian, Asian, Italian
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- meal_plans
-- One row per family × date – which meal is planned for that day.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_plans (
  id         uuid        primary key default gen_random_uuid(),
  family_id  uuid        not null references public.families(id) on delete cascade,
  plan_date  date        not null,
  meal_id    uuid        references public.meals(id) on delete set null,
  notes      text        not null default '',
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (family_id, plan_date)
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table public.families    enable row level security;
alter table public.user_families enable row level security;
alter table public.meals       enable row level security;
alter table public.meal_plans  enable row level security;

-- ---------------------------------------------------------------------------
-- families policies
-- Any authenticated user may read families (required for the "join by code"
-- flow before the user is recorded as a member).
-- ---------------------------------------------------------------------------
create policy "Authenticated users can view families"
  on public.families for select
  to authenticated
  using (true);

create policy "Authenticated users can create families"
  on public.families for insert
  to authenticated
  with check (true);

create policy "Family members can update their family"
  on public.families for update
  to authenticated
  using (
    id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- user_families policies
-- ---------------------------------------------------------------------------
create policy "Users can view their own memberships"
  on public.user_families for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can join families"
  on public.user_families for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can leave families"
  on public.user_families for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- meals policies – only family members can read / write
-- ---------------------------------------------------------------------------
create policy "Family members can view meals"
  on public.meals for select
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can add meals"
  on public.meals for insert
  to authenticated
  with check (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can update meals"
  on public.meals for update
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can delete meals"
  on public.meals for delete
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- meal_plans policies – only family members can read / write
-- ---------------------------------------------------------------------------
create policy "Family members can view meal plans"
  on public.meal_plans for select
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can add meal plans"
  on public.meal_plans for insert
  to authenticated
  with check (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can update meal plans"
  on public.meal_plans for update
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

create policy "Family members can delete meal plans"
  on public.meal_plans for delete
  to authenticated
  using (
    family_id in (
      select family_id from public.user_families where user_id = auth.uid()
    )
  );

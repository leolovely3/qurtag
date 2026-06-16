-- QurTag — initial schema
-- Households, items, tags, scans. RLS-first. A household is auto-created
-- for every new auth user via trigger.

set search_path = public;

-- ─────────────── tables ───────────────

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'plus', 'family', 'business')),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'member', 'child', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  brand text,
  model text,
  color text,
  declared_value_cents integer,
  hero_photo_url text,
  lost_mode boolean not null default false,
  reward_amount_cents integer,
  drop_off_preference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  household_id uuid not null references households(id) on delete cascade,
  current_item_id uuid references items(id) on delete set null,
  hardware_tier text not null default 'printable'
    check (hardware_tier in ('printable', 'core', 'pro', 'signature', 'track')),
  status text not null default 'active' check (status in ('active', 'inactive', 'replaced')),
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references tags(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  scanned_at timestamptz not null default now(),
  ip_country text,
  user_agent_class text,
  finder_session_id uuid
);

create index if not exists items_household_idx on items(household_id);
create index if not exists tags_household_idx on tags(household_id);
create index if not exists tags_public_id_idx on tags(public_id);
create index if not exists scans_tag_idx on scans(tag_id, scanned_at desc);

-- ─────────────── RLS ───────────────

alter table households enable row level security;
alter table household_members enable row level security;
alter table items enable row level security;
alter table tags enable row level security;
alter table scans enable row level security;

-- Helper: every household_id the current user belongs to.
create or replace function user_household_ids()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- households
drop policy if exists "households: members can read" on households;
create policy "households: members can read" on households
  for select to authenticated using (id in (select user_household_ids()));

drop policy if exists "households: owner can insert" on households;
create policy "households: owner can insert" on households
  for insert to authenticated with check (owner_user_id = auth.uid());

drop policy if exists "households: owner can update" on households;
create policy "households: owner can update" on households
  for update to authenticated using (owner_user_id = auth.uid());

-- household_members
drop policy if exists "members: read your own + co-members" on household_members;
create policy "members: read your own + co-members" on household_members
  for select to authenticated using (
    user_id = auth.uid() or household_id in (select user_household_ids())
  );

drop policy if exists "members: admins add members" on household_members;
create policy "members: admins add members" on household_members
  for insert to authenticated with check (household_id in (select user_household_ids()));

-- items
drop policy if exists "items: members read" on items;
create policy "items: members read" on items
  for select to authenticated using (household_id in (select user_household_ids()));

drop policy if exists "items: members insert" on items;
create policy "items: members insert" on items
  for insert to authenticated with check (household_id in (select user_household_ids()));

drop policy if exists "items: members update" on items;
create policy "items: members update" on items
  for update to authenticated using (household_id in (select user_household_ids()));

drop policy if exists "items: members delete" on items;
create policy "items: members delete" on items
  for delete to authenticated using (household_id in (select user_household_ids()));

-- tags
drop policy if exists "tags: members read" on tags;
create policy "tags: members read" on tags
  for select to authenticated using (household_id in (select user_household_ids()));

drop policy if exists "tags: anon read by public_id" on tags;
create policy "tags: anon read by public_id" on tags
  for select to anon using (status = 'active');

drop policy if exists "tags: members insert" on tags;
create policy "tags: members insert" on tags
  for insert to authenticated with check (household_id in (select user_household_ids()));

drop policy if exists "tags: members update" on tags;
create policy "tags: members update" on tags
  for update to authenticated using (household_id in (select user_household_ids()));

-- scans — owners read their household's scans; anyone (anon or auth) can insert (finder page).
drop policy if exists "scans: owners read" on scans;
create policy "scans: owners read" on scans
  for select to authenticated using (
    tag_id in (select id from tags where household_id in (select user_household_ids()))
  );

drop policy if exists "scans: public insert" on scans;
create policy "scans: public insert" on scans
  for insert to anon, authenticated with check (true);

-- ─────────────── triggers ───────────────

-- Auto-create a household + admin membership for every new user.
create or replace function handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  new_household_id uuid;
begin
  insert into public.households (name, owner_user_id, plan_tier)
  values (coalesce(new.email, 'My household'), new.id, 'free')
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Touch items.updated_at on update.
create or replace function set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

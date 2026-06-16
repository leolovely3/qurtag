-- QurTag — addresses + rewards + trips + inbox actions
-- Adds the foundation everything else this push depends on.

-- ─────────────── owner return address on households ───────────────
alter table households add column if not exists return_address_line text;
alter table households add column if not exists return_city text;
alter table households add column if not exists return_state text;
alter table households add column if not exists return_postal_code text;
alter table households add column if not exists return_country text default 'US';

-- ─────────────── rewards (Stripe-backed escrow) ───────────────

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  thread_id uuid references threads(id) on delete set null,

  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  stripe_client_secret text,

  finder_payout_email text,
  state text not null default 'pending' check (state in (
    'pending', 'held', 'released', 'refunded', 'failed'
  )),

  created_at timestamptz not null default now(),
  held_at timestamptz,
  released_at timestamptz
);

create index if not exists rewards_item_idx on rewards(item_id);
create index if not exists rewards_household_idx on rewards(household_id);
create index if not exists rewards_thread_idx on rewards(thread_id);

alter table rewards enable row level security;

drop policy if exists "rewards: members read" on rewards;
create policy "rewards: members read" on rewards for select to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "rewards: anon read by thread" on rewards;
create policy "rewards: anon read by thread" on rewards for select to anon
  using (thread_id is not null);

drop policy if exists "rewards: members insert" on rewards;
create policy "rewards: members insert" on rewards for insert to authenticated
  with check (household_id in (select user_household_ids()));

drop policy if exists "rewards: members update" on rewards;
create policy "rewards: members update" on rewards for update to authenticated
  using (household_id in (select user_household_ids()));

-- ─────────────── trips ───────────────

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  flight_number text,
  origin_iata text,
  destination_iata text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  live_status text,
  live_status_updated_at timestamptz,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trips_household_idx
  on trips(household_id, active_until desc nulls first);

alter table trips enable row level security;

drop policy if exists "trips: members read" on trips;
create policy "trips: members read" on trips for select to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "trips: anon read" on trips;
create policy "trips: anon read" on trips for select to anon using (true);

drop policy if exists "trips: members insert" on trips;
create policy "trips: members insert" on trips for insert to authenticated
  with check (household_id in (select user_household_ids()));

drop policy if exists "trips: members update" on trips;
create policy "trips: members update" on trips for update to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "trips: members delete" on trips;
create policy "trips: members delete" on trips for delete to authenticated
  using (household_id in (select user_household_ids()));

-- Items × trips many-to-many.
create table if not exists trip_items (
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (trip_id, item_id)
);

alter table trip_items enable row level security;

drop policy if exists "trip_items: members read" on trip_items;
create policy "trip_items: members read" on trip_items for select to authenticated
  using (trip_id in (select id from trips where household_id in (select user_household_ids())));

drop policy if exists "trip_items: anon read" on trip_items;
create policy "trip_items: anon read" on trip_items for select to anon using (true);

drop policy if exists "trip_items: members write" on trip_items;
create policy "trip_items: members write" on trip_items for all to authenticated
  using (trip_id in (select id from trips where household_id in (select user_household_ids())))
  with check (trip_id in (select id from trips where household_id in (select user_household_ids())));

-- ─────────────── trust & safety ───────────────

create table if not exists blocked_finder_sessions (
  household_id uuid not null references households(id) on delete cascade,
  finder_session_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (household_id, finder_session_id)
);

alter table blocked_finder_sessions enable row level security;

drop policy if exists "blocked: members read" on blocked_finder_sessions;
create policy "blocked: members read" on blocked_finder_sessions for select to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "blocked: members insert" on blocked_finder_sessions;
create policy "blocked: members insert" on blocked_finder_sessions for insert to authenticated
  with check (household_id in (select user_household_ids()));

drop policy if exists "blocked: members delete" on blocked_finder_sessions;
create policy "blocked: members delete" on blocked_finder_sessions for delete to authenticated
  using (household_id in (select user_household_ids()));

create table if not exists abuse_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete set null,
  household_id uuid not null references households(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('spam', 'harassment', 'fraud', 'other')),
  body text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table abuse_reports enable row level security;

drop policy if exists "abuse: members read" on abuse_reports;
create policy "abuse: members read" on abuse_reports for select to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "abuse: members insert" on abuse_reports;
create policy "abuse: members insert" on abuse_reports for insert to authenticated
  with check (household_id in (select user_household_ids()) and reporter_user_id = auth.uid());

-- QurTag — courier orders
--
-- A pickup request from a finder. Address is encrypted-at-rest (TODO: wrap
-- with pgsodium when we add encryption) and never exposed to the owner.
-- Owner sees an address-blind system message in the thread; the label is
-- generated server-side and emailed directly to the finder.

create table if not exists courier_orders (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,

  -- Finder-supplied
  address_line text not null,
  city text,
  pickup_window text not null,

  -- Carrier integration outputs
  carrier text,                -- 'usps' | 'fedex' | 'ups' | 'dhl'
  service_level text,
  label_url text,
  tracking_number text,

  state text not null default 'requested' check (state in (
    'requested', 'paid', 'label_generated', 'picked_up', 'delivered', 'cancelled'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courier_orders_thread_idx on courier_orders(thread_id);
create index if not exists courier_orders_household_idx on courier_orders(household_id);

alter table courier_orders enable row level security;

-- Owners read on their household. Anon (finder) can read by knowing the id
-- (Stripe-style); we never give them a list endpoint.
drop policy if exists "courier_orders: members read" on courier_orders;
create policy "courier_orders: members read"
  on courier_orders for select to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "courier_orders: anon read" on courier_orders;
create policy "courier_orders: anon read"
  on courier_orders for select to anon using (true);

-- Anon can insert (finder side). Validate the thread points at a real
-- household item with an active tag, just like the threads policy.
drop policy if exists "courier_orders: anon insert via thread" on courier_orders;
create policy "courier_orders: anon insert via thread"
  on courier_orders for insert to anon, authenticated
  with check (
    thread_id in (
      select id from public.threads where household_id = courier_orders.household_id
    )
  );

-- Owners can update state (mark paid, etc).
drop policy if exists "courier_orders: members update" on courier_orders;
create policy "courier_orders: members update"
  on courier_orders for update to authenticated
  using (household_id in (select user_household_ids()));

drop trigger if exists courier_orders_set_updated_at on courier_orders;
create trigger courier_orders_set_updated_at
  before update on courier_orders
  for each row execute function set_updated_at();

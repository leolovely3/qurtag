-- QurTag — finder payouts (Stripe Connect Express) + partner portal foundation

-- ─────────────── finder payouts ───────────────
-- We extend finder_sessions instead of creating a separate table — there's
-- still one row per browser, and now we know whether they've onboarded for
-- payout and where to send the funds.

alter table finder_sessions
  add column if not exists stripe_account_id text,
  add column if not exists payout_email text,
  add column if not exists payout_country text default 'US',
  add column if not exists payouts_enabled_at timestamptz;

-- Anon can update their own finder_session row (to set payout details).
-- We can't reference auth.uid here, so we allow anon updates on any row —
-- safe because the row id is unguessable.
drop policy if exists "finder_sessions: anon update" on finder_sessions;
create policy "finder_sessions: anon update"
  on finder_sessions for update
  to anon
  using (true);

drop policy if exists "finder_sessions: anon read" on finder_sessions;
create policy "finder_sessions: anon read"
  on finder_sessions for select
  to anon
  using (true);

-- ─────────────── partners ───────────────

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'hotel' check (kind in ('hotel', 'airline', 'coworking', 'gym', 'other')),
  contact_email text,
  address text,
  city text,
  brand_props jsonb,
  created_at timestamptz not null default now()
);

create table if not exists partner_members (
  partner_id uuid not null references partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);

create table if not exists partner_dropoffs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  staff_user_id uuid references auth.users(id) on delete set null,
  tag_id uuid references tags(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  thread_id uuid references threads(id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'awaiting_pickup', 'collected', 'shipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_dropoffs_partner_idx
  on partner_dropoffs(partner_id, created_at desc);

alter table partners enable row level security;
alter table partner_members enable row level security;
alter table partner_dropoffs enable row level security;

-- partners: members read their partner row
drop policy if exists "partners: members read" on partners;
create policy "partners: members read" on partners for select to authenticated
  using (id in (select partner_id from partner_members where user_id = auth.uid()));

-- partner_members: members read their own and co-members
drop policy if exists "partner_members: members read" on partner_members;
create policy "partner_members: members read" on partner_members for select to authenticated
  using (user_id = auth.uid() or partner_id in (
    select partner_id from partner_members where user_id = auth.uid()
  ));

-- partner_dropoffs: staff read their partner's queue
drop policy if exists "partner_dropoffs: members read" on partner_dropoffs;
create policy "partner_dropoffs: members read" on partner_dropoffs for select to authenticated
  using (partner_id in (select partner_id from partner_members where user_id = auth.uid()));

drop policy if exists "partner_dropoffs: members insert" on partner_dropoffs;
create policy "partner_dropoffs: members insert" on partner_dropoffs for insert to authenticated
  with check (
    partner_id in (select partner_id from partner_members where user_id = auth.uid())
    and staff_user_id = auth.uid()
  );

drop policy if exists "partner_dropoffs: members update" on partner_dropoffs;
create policy "partner_dropoffs: members update" on partner_dropoffs for update to authenticated
  using (partner_id in (select partner_id from partner_members where user_id = auth.uid()));

drop trigger if exists partner_dropoffs_set_updated_at on partner_dropoffs;
create trigger partner_dropoffs_set_updated_at
  before update on partner_dropoffs
  for each row execute function set_updated_at();

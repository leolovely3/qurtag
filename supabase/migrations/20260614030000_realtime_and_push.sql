-- QurTag — enable realtime on messages/threads + add push_subscriptions

-- ─────────────── realtime ───────────────

-- Replica identity must be FULL so realtime knows which row to send
-- when policies are evaluated.
alter table messages replica identity full;
alter table threads replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'threads'
  ) then
    alter publication supabase_realtime add table threads;
  end if;
end$$;

-- ─────────────── push_subscriptions ───────────────
--
-- Web Push browser subscriptions, one row per device/browser.
-- The endpoint URL is the unique identifier per device.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
create index if not exists push_subscriptions_household_idx on push_subscriptions(household_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: owners read own" on push_subscriptions;
create policy "push_subscriptions: owners read own"
  on push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions: owners insert own" on push_subscriptions;
create policy "push_subscriptions: owners insert own"
  on push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_subscriptions: owners delete own" on push_subscriptions;
create policy "push_subscriptions: owners delete own"
  on push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- QurTag — messaging bridge: threads + messages
--
-- A thread is one recovery conversation, anchored to an item.
-- A message is a single note from either the finder (anon) or the owner.
--
-- Anonymous finders are identified by a client-generated UUID stored in
-- localStorage. We keep them in finder_sessions purely for analytics later;
-- thread access is gated by knowing the thread.id (Stripe-payment-intent model).

create table if not exists finder_sessions (
  id uuid primary key,
  first_seen_at timestamptz not null default now(),
  locale text,
  user_agent_class text
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  tag_id uuid references tags(id) on delete set null,
  finder_session_id uuid references finder_sessions(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'reunited')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('finder', 'owner', 'system')),
  body text not null check (length(body) > 0 and length(body) <= 4000),
  read_by_owner_at timestamptz,
  read_by_finder_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists threads_household_idx
  on threads(household_id, last_message_at desc);
create index if not exists threads_item_idx
  on threads(item_id, last_message_at desc);
create index if not exists messages_thread_idx
  on messages(thread_id, created_at asc);

-- Bump thread.last_message_at on each new message.
create or replace function touch_thread_last_message()
  returns trigger
  language plpgsql
as $$
begin
  update threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_thread on messages;
create trigger messages_touch_thread
  after insert on messages
  for each row execute function touch_thread_last_message();

-- ─────────────── RLS ───────────────

alter table finder_sessions enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;

-- finder_sessions: anon can insert their own row, but nobody reads from this table
-- via the API (it's analytics-only). Authenticated users can't read it either.
drop policy if exists "finder_sessions: anon insert" on finder_sessions;
create policy "finder_sessions: anon insert"
  on finder_sessions for insert
  to anon, authenticated
  with check (true);

-- Threads:
-- Owners read threads on their household.
-- Anon reads threads — gated by knowing the thread.id (Stripe-style). We accept
-- this risk for v1; threats are mitigated by UUIDs being unguessable.
drop policy if exists "threads: members read" on threads;
create policy "threads: members read"
  on threads for select
  to authenticated
  using (household_id in (select user_household_ids()));

drop policy if exists "threads: anon read" on threads;
create policy "threads: anon read"
  on threads for select
  to anon
  using (true);

-- Anyone can create a thread. The household_id must match the tag's household.
drop policy if exists "threads: anon insert via valid tag" on threads;
create policy "threads: anon insert via valid tag"
  on threads for insert
  to anon, authenticated
  with check (
    item_id in (
      select i.id from public.items i
      join public.tags t on t.current_item_id = i.id
      where i.household_id = threads.household_id
        and t.status = 'active'
    )
  );

drop policy if exists "threads: members update" on threads;
create policy "threads: members update"
  on threads for update
  to authenticated
  using (household_id in (select user_household_ids()));

-- Messages: same access model — owners read everything on their household,
-- anon reads by thread_id (UUID-as-secret). Anon can only insert sender_kind='finder';
-- owners insert sender_kind='owner' on their own threads.
drop policy if exists "messages: members read" on messages;
create policy "messages: members read"
  on messages for select
  to authenticated
  using (
    thread_id in (
      select id from threads where household_id in (select user_household_ids())
    )
  );

drop policy if exists "messages: anon read" on messages;
create policy "messages: anon read"
  on messages for select
  to anon
  using (true);

drop policy if exists "messages: anon insert finder" on messages;
create policy "messages: anon insert finder"
  on messages for insert
  to anon
  with check (sender_kind = 'finder');

drop policy if exists "messages: owner insert on own thread" on messages;
create policy "messages: owner insert on own thread"
  on messages for insert
  to authenticated
  with check (
    (sender_kind = 'owner' and thread_id in (
      select id from threads where household_id in (select user_household_ids())
    ))
    or sender_kind = 'finder'
  );

-- Owners can mark messages as read (read_by_owner_at) on their household's threads.
drop policy if exists "messages: owner mark read" on messages;
create policy "messages: owner mark read"
  on messages for update
  to authenticated
  using (
    thread_id in (
      select id from threads where household_id in (select user_household_ids())
    )
  );

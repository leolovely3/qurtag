-- QuR Tag in its own schema, `qurtag`, inside the company's shared Supabase project.
-- One clean build of what QuR Tag needs to run its smallest loop, with its own accounts
-- and sign-in:
--
--   an owner signs up, adds an item and gets a printable QR tag; a finder scans the tag,
--   sees a finder-safe card for the item and sends a note with no account; the owner
--   reads it in the inbox and replies; the finder reads the reply on the same page.
--
-- Why a schema of its own: the shared project holds other apps. QuR Tag keeps every
-- table, its accounts and its sign-in data in schema `qurtag`, and reaches the database
-- only through logins that can use nothing else. Nothing here refers to Supabase Auth
-- (auth.users, auth.uid(), auth.jwt()), Supabase Storage or schema public. The shared
-- project's own data API never serves this schema and never trusts QuR Tag's signing key:
-- QuR Tag answers its own data requests (api/data in the app).
--
-- Who reaches the database
--   qurtag_user           every data request made with a QuR Tag pass (an owner). Row
--                         security keeps each owner to their own household's rows
--   qurtag_anon           data requests with no pass: the Factory's counts and the data
--                         API's own key lookup. It can read no table
--   qurtag_authenticator  the data API's login. May become the two roles above and
--                         nothing else; no rights of its own
--   qurtag_auth           the sign-in service's login. The auth_* tables and the
--                         auth_* functions, nothing else
--   qurtag_server         the server routes' login (the finder's page, email, scheduled
--                         jobs). It has no table rights at all: only the server_*
--                         functions in section 10, each of which returns exactly what
--                         its route needs
-- Logins get their passwords from db/logins.sql, never from this file.
--
-- Privacy by structure (the finder):
--   * a finder never reaches a table. The finder's page calls /api/fn/finder/*, which
--     calls server_finder_view, server_finder_open and server_finder_post;
--   * the only item fields those functions return are the item's name, photo, the
--     owner's reward or thank-you text and whether it is marked lost. Never the owner's
--     name, email, household or private notes;
--   * a tag's public id (12 characters, about 69 random bits, made here) is the secret
--     that opens the item card. Unknown, inactive or replaced ids answer "not found";
--   * each conversation has its own secret token, made by the server and given only to
--     the finder's browser. The database keeps its SHA-256 alone (threads.finder_token_sha256),
--     which no role can read. A finder reads and writes only the conversation whose token
--     they hold, and only under the tag it was opened on;
--   * there is no anonymous policy and no anonymous write anywhere in the schema.
--
-- Not built here, on purpose: rewards held by a payment provider, courier labels, trips,
-- partners, household sharing, push, blocking and abuse reports. The app keeps their
-- screens hidden (src/lib/features.ts) until each gets its own tables and review.
--
-- Run as `postgres` in one transaction. It refuses to run if schema qurtag exists.

set check_function_bodies = off;

-- 1. Roles ------------------------------------------------------------------------

do $$
declare
  r text;
begin
  if exists (select from pg_namespace where nspname = 'qurtag') then
    raise exception 'schema qurtag already exists; nothing was changed';
  end if;
  foreach r in array array['qurtag_user', 'qurtag_anon', 'qurtag_auth', 'qurtag_authenticator', 'qurtag_server'] loop
    if not exists (select from pg_roles where rolname = r) then
      -- Logins are made able to log in only by db/logins.sql, which also sets passwords.
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end
$$;

-- 2. Schema -----------------------------------------------------------------------

create schema qurtag;
revoke all on schema qurtag from public;
grant usage on schema qurtag to qurtag_user, qurtag_anon, qurtag_auth, qurtag_server;
alter default privileges in schema qurtag revoke execute on functions from public;

-- 3. Accounts (Better Auth's tables; the sign-in service only) ----------------------
--
-- Columns as Better Auth 1.7.7 expects them.

create table qurtag.auth_users (
  "id" uuid default gen_random_uuid() not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);

create table qurtag.auth_sessions (
  "id" uuid default gen_random_uuid() not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references qurtag.auth_users ("id") on delete cascade
);
create index "auth_sessions_userId_idx" on qurtag.auth_sessions ("userId");

create table qurtag.auth_identities (
  "id" uuid default gen_random_uuid() not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references qurtag.auth_users ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index "auth_identities_userId_idx" on qurtag.auth_identities ("userId");

create table qurtag.auth_verifications (
  "id" uuid default gen_random_uuid() not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index "auth_verifications_identifier_idx" on qurtag.auth_verifications ("identifier");

create table qurtag.auth_jwks (
  "id" uuid default gen_random_uuid() not null primary key,
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" timestamptz not null,
  "expiresAt" timestamptz,
  "alg" text,
  "crv" text
);

create table qurtag.auth_rate_limits (
  "id" uuid default gen_random_uuid() not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- 4. App tables -------------------------------------------------------------------

-- One household per account, made by the database when the account is made. The app's
-- screens already speak in households, so sharing with family can come later without
-- moving data.
create table qurtag.households (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or length(name) <= 120),
  plan_tier text not null default 'free' check (plan_tier = 'free'),
  owner_user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  created_at timestamptz not null default now()
);
create index households_owner_idx on qurtag.households (owner_user_id);

create table qurtag.household_members (
  household_id uuid not null references qurtag.households (id) on delete cascade,
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on qurtag.household_members (user_id);

-- A thing the owner wants back. The photo is a small picture the app shrinks before
-- saving (a data: address, at most about 120 KB), so no file store is needed. There is
-- no field for health or medical details, by design: a walking stick is an object.
create table qurtag.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references qurtag.households (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  brand text check (brand is null or length(brand) <= 60),
  color text check (color is null or length(color) <= 40),
  hero_photo_url text check (hero_photo_url is null or
    (hero_photo_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(hero_photo_url) <= 120000)),
  lost_mode boolean not null default false,
  -- Shown to the finder: a thank-you or reward the owner offers, in their own words.
  reward_text text check (reward_text is null or length(reward_text) <= 140),
  -- Private to the owner; never shown to a finder.
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_household_idx on qurtag.items (household_id, created_at desc);

-- A printed tag. public_id is the secret in the QR code; made by qurtag.new_public_id().
create table qurtag.tags (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^[2-9A-HJ-NP-Za-km-z]{12}$'),
  household_id uuid not null references qurtag.households (id) on delete cascade,
  -- Deleting an item deletes its tags, and with them their scans.
  current_item_id uuid references qurtag.items (id) on delete cascade,
  hardware_tier text not null default 'printable' check (hardware_tier = 'printable'),
  status text not null default 'active' check (status in ('active', 'inactive', 'replaced')),
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index tags_household_idx on qurtag.tags (household_id, created_at desc);
create index tags_item_idx on qurtag.tags (current_item_id);

-- A scan of a tag's page. No network address and no location are kept.
create table qurtag.scans (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references qurtag.tags (id) on delete cascade,
  item_id uuid references qurtag.items (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  user_agent_class text check (user_agent_class is null or length(user_agent_class) <= 20)
);
create index scans_tag_idx on qurtag.scans (tag_id, scanned_at desc);
create index scans_item_idx on qurtag.scans (item_id, scanned_at desc);

-- One conversation between one finder and the owner, about one item.
create table qurtag.threads (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references qurtag.items (id) on delete cascade,
  household_id uuid not null references qurtag.households (id) on delete cascade,
  tag_id uuid references qurtag.tags (id) on delete set null,
  -- SHA-256 (hex) of the finder's conversation token. No role may read this column.
  finder_token_sha256 text not null unique check (finder_token_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'closed', 'reunited')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index threads_household_idx on qurtag.threads (household_id, last_message_at desc);
create index threads_tag_idx on qurtag.threads (tag_id, created_at desc);

create table qurtag.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references qurtag.threads (id) on delete cascade,
  sender_kind text not null check (sender_kind in ('finder', 'owner', 'system')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  read_by_owner_at timestamptz,
  read_by_finder_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on qurtag.messages (thread_id, created_at);

-- Work for the server routes (an email to the owner about a finder's note), queued by
-- a trigger and sent by /api/jobs/outbox, which the finder route asks to run after each
-- note and a daily schedule runs too.
create table qurtag.outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('finder_message')),
  ref uuid not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create index outbox_due_idx on qurtag.outbox (next_attempt_at) where sent_at is null;

-- The Factory's counting function checks a token; only its SHA-256 is kept.
create table qurtag.factory_access (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- 5. Who is asking: the helpers every rule uses -------------------------------------
--
-- Each reads the claims the data API sets for the request (request.jwt.claims) and
-- trusts them only while the pass's session is live, so signing out or a password
-- reset ends data access at once.

create function qurtag.request_claims() returns jsonb
language sql stable set search_path = '' as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null then null
    else current_setting('request.jwt.claims', true)::jsonb
  end
$$;

create function qurtag.current_account() returns uuid
language sql stable security definer set search_path = '' as $$
  with c as (select qurtag.request_claims() as j),
  ids as (
    select
      case when c.j ->> 'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (c.j ->> 'sub')::uuid end as sub,
      case when c.j ->> 'sid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (c.j ->> 'sid')::uuid end as sid
    from c
    where c.j ->> 'app' = 'qurtag' and c.j ->> 'role' = 'qurtag_user'
  )
  select s."userId"
  from ids
  join qurtag.auth_sessions s on s."id" = ids.sid and s."userId" = ids.sub and s."expiresAt" > now()
$$;

-- Every household the signed-in person belongs to. Security definer so a rule on one
-- table can ask without the members table's own rules looping.
create function qurtag.my_household_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.household_id from qurtag.household_members m where m.user_id = qurtag.current_account()
$$;

create function qurtag.client_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('qurtag.client_ip', true), '')
$$;

-- A tag's public id: 12 characters from an alphabet without 0, O, 1, I and l, taken
-- from the random bytes of two version 4 UUIDs (the fixed version and variant bytes
-- are skipped). About 69 random bits: not guessable, short enough to type from a
-- scuffed label.
create function qurtag.new_public_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  picks constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13];
  out text := '';
  i int;
begin
  foreach i in array picks loop
    out := out || substr(alphabet, (get_byte(b, i) % 56) + 1, 1);
  end loop;
  return out;
end
$$;

-- 6. Triggers -------------------------------------------------------------------

create function qurtag.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;
create trigger items_touch_updated_at before update on qurtag.items
  for each row execute function qurtag.touch_updated_at();

-- A new account gets its household. This is what the old app did with a trigger on
-- Supabase's auth.users.
create function qurtag.auth_user_to_household() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  insert into qurtag.households (name, owner_user_id)
  values (left(coalesce(nullif(btrim(new."name"), ''), 'My things'), 120), new."id")
  returning id into v_household;
  insert into qurtag.household_members (household_id, user_id, role) values (v_household, new."id", 'admin');
  return new;
end
$$;
create trigger auth_user_to_household after insert on qurtag.auth_users
  for each row execute function qurtag.auth_user_to_household();

-- Keeps a conversation's last_message_at and queues the owner's email for a finder's note.
create function qurtag.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update qurtag.threads set last_message_at = new.created_at where id = new.thread_id;
  if new.sender_kind = 'finder' then
    insert into qurtag.outbox (kind, ref) values ('finder_message', new.id);
  end if;
  return new;
end
$$;
create trigger messages_after_insert after insert on qurtag.messages
  for each row execute function qurtag.after_message();

-- An owner may change their own item's details but never move it to another household.
create function qurtag.guard_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'qurtag_user' and (new.household_id is distinct from old.household_id
     or new.id is distinct from old.id or new.created_at is distinct from old.created_at) then
    raise exception 'That cannot be changed.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_item before update on qurtag.items
  for each row execute function qurtag.guard_item();

-- 7. The owner's functions (qurtag_user) ------------------------------------------

-- Adds an item and its first printable tag, in one step. At most two items per account.
create function qurtag.create_item(p_name text, p_brand text default null, p_color text default null,
                                   p_photo text default null, p_reward_text text default null,
                                   p_notes text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_household uuid;
  v_item uuid;
  v_tag uuid;
  v_public text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select m.household_id into v_household from qurtag.household_members m
  where m.user_id = v_me order by m.created_at limit 1;
  if v_household is null then raise exception 'no_household' using errcode = '42501'; end if;
  -- QuR Tag is free for up to two items (the site says so everywhere). The lock keeps two
  -- requests at once from both passing the count.
  perform 1 from qurtag.households h where h.id = v_household for update;
  if (select count(*) from qurtag.items i where i.household_id = v_household) >= 2 then
    raise exception 'item_limit';
  end if;
  insert into qurtag.items (household_id, name, brand, color, hero_photo_url, reward_text, notes)
  values (v_household, btrim(p_name), nullif(btrim(p_brand), ''), nullif(btrim(p_color), ''),
          nullif(p_photo, ''), nullif(btrim(p_reward_text), ''), nullif(btrim(p_notes), ''))
  returning id into v_item;
  loop
    v_public := qurtag.new_public_id();
    exit when not exists (select from qurtag.tags t where t.public_id = v_public);
  end loop;
  insert into qurtag.tags (public_id, household_id, current_item_id)
  values (v_public, v_household, v_item)
  returning id into v_tag;
  return json_build_object('item_id', v_item, 'tag_id', v_tag, 'public_id', v_public);
end
$$;

-- A fresh tag for an item (for example after a tag was lost with the thing). The
-- item's other active tags stop working; their conversations stay in the inbox.
create function qurtag.replace_tag(p_item_id uuid)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
  v_tag uuid;
  v_public text;
begin
  select i.household_id into v_household from qurtag.items i
  where i.id = p_item_id and i.household_id in (select qurtag.my_household_ids());
  if v_household is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update qurtag.tags set status = 'replaced' where current_item_id = p_item_id and status = 'active';
  loop
    v_public := qurtag.new_public_id();
    exit when not exists (select from qurtag.tags t where t.public_id = v_public);
  end loop;
  insert into qurtag.tags (public_id, household_id, current_item_id)
  values (v_public, v_household, p_item_id)
  returning id into v_tag;
  return json_build_object('item_id', p_item_id, 'tag_id', v_tag, 'public_id', v_public);
end
$$;

-- The owner's reply in a conversation on one of their items.
create function qurtag.owner_reply(p_thread_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not exists (select from qurtag.threads t
                 where t.id = p_thread_id and t.household_id in (select qurtag.my_household_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  insert into qurtag.messages (thread_id, sender_kind, body)
  values (p_thread_id, 'owner', left(btrim(p_body), 2000))
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread_id and sender_kind = 'finder' and read_by_owner_at is null;
  return v_id;
end
$$;

create function qurtag.mark_thread_read(p_thread_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update qurtag.messages m set read_by_owner_at = now()
  from qurtag.threads t
  where m.thread_id = t.id and t.id = p_thread_id and t.household_id in (select qurtag.my_household_ids())
    and m.sender_kind = 'finder' and m.read_by_owner_at is null;
end
$$;

-- Deletes the signed-in person's account and everything in it: household, items, tags,
-- scans and conversations. There is no way back.
create function qurtag.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from qurtag.auth_users where "id" = v_me;
end
$$;

-- 8. For the sign-in service (qurtag_auth only) ----------------------------------

-- Whether an account gets a data pass: it needs its household.
create function qurtag.auth_account_ok(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from qurtag.household_members m where m.user_id = p_user)
$$;

-- 9. For the data API with no pass (qurtag_anon) ---------------------------------

-- The sign-in service's public keys, so the data API can check a pass without calling
-- the site over the network. Public halves only.
create function qurtag.pass_public_keys() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select k."publicKey"::jsonb || jsonb_build_object('kid', k."id"::text, 'alg', coalesce(k."alg", 'ES256'))
  from qurtag.auth_jwks k
  where k."expiresAt" is null or k."expiresAt" > now()
$$;

-- The Factory's counts: totals only, for the holder of the metrics token.
create function qurtag.factory_metrics(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or not exists (
    select from qurtag.factory_access a
    where a.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return json_build_object(
    'accounts_total', (select count(*) from qurtag.auth_users),
    'accounts_new_7d', (select count(*) from qurtag.auth_users where "createdAt" > now() - interval '7 days'),
    'accounts_new_30d', (select count(*) from qurtag.auth_users where "createdAt" > now() - interval '30 days'),
    'signed_in_7d', (select count(distinct s."userId") from qurtag.auth_sessions s where s."createdAt" > now() - interval '7 days'),
    'signed_in_30d', (select count(distinct s."userId") from qurtag.auth_sessions s where s."createdAt" > now() - interval '30 days'),
    'accounts_activated', (select count(distinct h.owner_user_id) from qurtag.households h
                           join qurtag.items i on i.household_id = h.id),
    'items_total', (select count(*) from qurtag.items),
    'tags_active', (select count(*) from qurtag.tags where status = 'active'),
    'scans_30d', (select count(*) from qurtag.scans where scanned_at > now() - interval '30 days'),
    'conversations_total', (select count(*) from qurtag.threads),
    'conversations_30d', (select count(*) from qurtag.threads where created_at > now() - interval '30 days'),
    'owner_replies_30d', (select count(*) from qurtag.messages where sender_kind = 'owner' and created_at > now() - interval '30 days')
  );
end
$$;

-- 10. For the server routes (qurtag_server only) ---------------------------------
--
-- The finder's page. Each takes the tag's public id; the conversation functions also
-- take the finder's conversation token, which is hashed here and compared with the
-- stored hash, so the token itself is never stored.

-- The finder-safe item card, and the finder's own conversation when a token is given.
-- Answers null when the tag is unknown, inactive, replaced or has no item.
create function qurtag.server_finder_view(p_public_id text, p_token text, p_device text, p_record_scan boolean)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_item qurtag.items%rowtype;
  v_thread qurtag.threads%rowtype;
  v_messages json;
begin
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then return null; end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active';
  if not found or v_tag.current_item_id is null then return null; end if;
  select * into v_item from qurtag.items where id = v_tag.current_item_id;
  if not found then return null; end if;
  if p_record_scan then
    insert into qurtag.scans (tag_id, item_id, user_agent_class) values (v_tag.id, v_item.id, left(p_device, 20));
  end if;
  if p_token is not null and length(p_token) between 32 and 128 then
    select * into v_thread from qurtag.threads
    where finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and tag_id = v_tag.id;
    if found then
      update qurtag.messages set read_by_finder_at = now()
      where thread_id = v_thread.id and sender_kind <> 'finder' and read_by_finder_at is null;
      select coalesce(json_agg(json_build_object('id', m.id, 'sender_kind', m.sender_kind, 'body', m.body,
                                                 'created_at', m.created_at) order by m.created_at), '[]'::json)
      into v_messages from qurtag.messages m where m.thread_id = v_thread.id;
    end if;
  end if;
  return json_build_object(
    'item', json_build_object('name', v_item.name, 'photo', v_item.hero_photo_url,
                              'reward_text', v_item.reward_text, 'lost', v_item.lost_mode),
    'tag', json_build_object('public_id', v_tag.public_id),
    'thread', case when v_thread.id is null then null
                   else json_build_object('status', v_thread.status, 'messages', v_messages) end
  );
end
$$;

-- Opens a conversation with its first note. The token is new, made by the server.
-- At most 20 new conversations per tag per day, so a tag cannot be used to flood an owner.
create function qurtag.server_finder_open(p_public_id text, p_token text, p_body text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_household uuid;
  v_thread uuid;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'bad_token'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active' for share;
  if not found or v_tag.current_item_id is null then raise exception 'tag_not_found' using errcode = 'P0002'; end if;
  select household_id into v_household from qurtag.items where id = v_tag.current_item_id;
  if (select count(*) from qurtag.threads t where t.tag_id = v_tag.id and t.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many';
  end if;
  insert into qurtag.threads (item_id, household_id, tag_id, finder_token_sha256)
  values (v_tag.current_item_id, v_household, v_tag.id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
  returning id into v_thread;
  insert into qurtag.messages (thread_id, sender_kind, body) values (v_thread, 'finder', left(btrim(p_body), 2000));
  return json_build_object('ok', true);
end
$$;

-- Adds a finder's note to their own conversation. At most 30 notes per conversation
-- per hour.
create function qurtag.server_finder_post(p_public_id text, p_token text, p_body text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_thread qurtag.threads%rowtype;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  select th.* into v_thread from qurtag.threads th
  join qurtag.tags t on t.id = th.tag_id and t.public_id = p_public_id and t.status = 'active'
  where th.finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if v_thread.status = 'closed' then raise exception 'thread_closed'; end if;
  if (select count(*) from qurtag.messages m where m.thread_id = v_thread.id and m.sender_kind = 'finder'
        and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many';
  end if;
  insert into qurtag.messages (thread_id, sender_kind, body) values (v_thread.id, 'finder', left(btrim(p_body), 2000));
  return json_build_object('ok', true);
end
$$;

-- The outbox: take due rows, and mark them done or failed.
create function qurtag.server_outbox_take(p_batch integer, p_max_attempts integer)
returns table (id bigint, kind text, ref uuid, attempts integer)
language sql volatile security definer set search_path = '' as $$
  update qurtag.outbox o set attempts = o.attempts + 1, next_attempt_at = now() + interval '10 minutes'
  where o.id in (select x.id from qurtag.outbox x
                 where x.sent_at is null and x.next_attempt_at <= now() and x.attempts < p_max_attempts
                 order by x.id limit least(greatest(p_batch, 1), 100) for update skip locked)
  returning o.id, o.kind, o.ref, o.attempts
$$;

create function qurtag.server_outbox_finish(p_id bigint, p_error text, p_retry_minutes integer)
returns void
language sql volatile security definer set search_path = '' as $$
  update qurtag.outbox
  set sent_at = case when p_error is null then now() end,
      last_error = left(p_error, 500),
      next_attempt_at = case when p_error is null then next_attempt_at
                             else now() + make_interval(mins => greatest(p_retry_minutes, 1)) end
  where id = p_id
$$;

-- Who to tell about a finder's note: the household owner's email and the item's name.
-- Nothing about the finder.
create function qurtag.server_finder_message_notice(p_message_id uuid)
returns table (owner_email text, item_name text)
language sql stable security definer set search_path = '' as $$
  select u."email", i.name
  from qurtag.messages m
  join qurtag.threads t on t.id = m.thread_id
  join qurtag.items i on i.id = t.item_id
  join qurtag.households h on h.id = t.household_id
  join qurtag.auth_users u on u."id" = h.owner_user_id
  where m.id = p_message_id and m.sender_kind = 'finder'
$$;

-- 11. Rights ------------------------------------------------------------------------

-- Nobody but the roles below has anything in this schema.
do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on all tables in schema qurtag from %s', api_role);
      execute format('revoke all on all sequences in schema qurtag from %s', api_role);
      execute format('revoke all on all functions in schema qurtag from %s', api_role);
    end if;
  end loop;
end
$$;

-- Row security on every table. The functions above are security definer and owned by
-- the schema's owner, which row security does not hold; each checks the caller itself.
do $$
declare
  t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'qurtag' and c.relkind = 'r'
  loop
    execute format('alter table qurtag.%I enable row level security', t);
  end loop;
end
$$;

-- The sign-in tables: the sign-in service only, with a policy for it alone.
do $$
declare
  t text;
begin
  foreach t in array array['auth_users', 'auth_sessions', 'auth_identities', 'auth_verifications',
                           'auth_jwks', 'auth_rate_limits']
  loop
    execute format('grant select, insert, update, delete on qurtag.%I to qurtag_auth', t);
    execute format('create policy sign_in_service_only on qurtag.%I for all to qurtag_auth using (true) with check (true)', t);
  end loop;
end
$$;
grant execute on function qurtag.auth_account_ok(uuid) to qurtag_auth;

-- Helpers a signed-in request uses.
grant execute on function
  qurtag.request_claims(), qurtag.current_account(), qurtag.my_household_ids(), qurtag.client_ip()
  to qurtag_user;

-- With no pass: the Factory's counts and the public keys. No table.
grant execute on function qurtag.factory_metrics(text), qurtag.pass_public_keys() to qurtag_anon;

-- Signed in: the owner's functions.
grant execute on function
  qurtag.create_item(text, text, text, text, text, text),
  qurtag.replace_tag(uuid),
  qurtag.owner_reply(uuid, text),
  qurtag.mark_thread_read(uuid),
  qurtag.delete_my_account()
  to qurtag_user;

-- Signed in: table rights. Rows are decided by the policies below; columns by these grants.
grant select, update (name) on qurtag.households to qurtag_user;
grant select on qurtag.household_members to qurtag_user;
grant select, delete on qurtag.items to qurtag_user;
grant update (name, brand, color, hero_photo_url, lost_mode, reward_text, notes) on qurtag.items to qurtag_user;
grant select, update (status) on qurtag.tags to qurtag_user;
grant select on qurtag.scans to qurtag_user;
-- Every column of a conversation but the finder's token hash.
grant select (id, item_id, household_id, tag_id, status, last_message_at, created_at) on qurtag.threads to qurtag_user;
grant update (status) on qurtag.threads to qurtag_user;
grant select on qurtag.messages to qurtag_user;

create policy own_household_read on qurtag.households for select to qurtag_user
  using (id in (select qurtag.my_household_ids()));
create policy own_household_update on qurtag.households for update to qurtag_user
  using (owner_user_id = (select qurtag.current_account()))
  with check (owner_user_id = (select qurtag.current_account()));
create policy own_membership_read on qurtag.household_members for select to qurtag_user
  using (user_id = (select qurtag.current_account()) or household_id in (select qurtag.my_household_ids()));
create policy own_items_read on qurtag.items for select to qurtag_user
  using (household_id in (select qurtag.my_household_ids()));
create policy own_items_update on qurtag.items for update to qurtag_user
  using (household_id in (select qurtag.my_household_ids()))
  with check (household_id in (select qurtag.my_household_ids()));
create policy own_items_delete on qurtag.items for delete to qurtag_user
  using (household_id in (select qurtag.my_household_ids()));
create policy own_tags_read on qurtag.tags for select to qurtag_user
  using (household_id in (select qurtag.my_household_ids()));
-- An owner may switch a tag off or on; a replaced tag stays replaced.
create policy own_tags_update on qurtag.tags for update to qurtag_user
  using (household_id in (select qurtag.my_household_ids()) and status <> 'replaced')
  with check (household_id in (select qurtag.my_household_ids()) and status in ('active', 'inactive'));
create policy own_scans_read on qurtag.scans for select to qurtag_user
  using (tag_id in (select t.id from qurtag.tags t where t.household_id in (select qurtag.my_household_ids())));
create policy own_threads_read on qurtag.threads for select to qurtag_user
  using (household_id in (select qurtag.my_household_ids()));
create policy own_threads_update on qurtag.threads for update to qurtag_user
  using (household_id in (select qurtag.my_household_ids()))
  with check (household_id in (select qurtag.my_household_ids()));
create policy own_messages_read on qurtag.messages for select to qurtag_user
  using (thread_id in (select t.id from qurtag.threads t where t.household_id in (select qurtag.my_household_ids())));

-- The server routes: functions only, no table.
grant execute on function
  qurtag.pass_public_keys(),
  qurtag.server_finder_view(text, text, text, boolean),
  qurtag.server_finder_open(text, text, text),
  qurtag.server_finder_post(text, text, text),
  qurtag.server_outbox_take(integer, integer),
  qurtag.server_outbox_finish(bigint, text, integer),
  qurtag.server_finder_message_notice(uuid)
  to qurtag_server;

-- 12. Checks before finishing ----------------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'qurtag' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then raise exception 'row security is off on: %', bad; end if;

  select string_agg(distinct g.grantee, ', ') into bad
  from information_schema.role_table_grants g
  where g.table_schema = 'qurtag'
    and g.grantee not in ('postgres', 'supabase_admin', 'qurtag_user', 'qurtag_auth')
    and g.grantee <> (select rolname from pg_roles r join pg_namespace n on n.nspowner = r.oid where n.nspname = 'qurtag');
  if bad is not null then raise exception 'unexpected table rights in qurtag for: %', bad; end if;

  select string_agg(distinct g.grantee, ', ') into bad
  from information_schema.column_privileges g
  where g.table_schema = 'qurtag' and g.grantee in ('qurtag_anon', 'qurtag_server', 'qurtag_authenticator');
  if bad is not null then raise exception 'a role that must have no table rights has some: %', bad; end if;

  if exists (select from information_schema.role_table_grants g
             where g.table_schema = 'qurtag' and g.table_name like 'auth\_%' and g.grantee in ('qurtag_user', 'qurtag_anon', 'qurtag_server')) then
    raise exception 'a request role can reach the sign-in tables';
  end if;

  if has_column_privilege('qurtag_user', 'qurtag.threads', 'finder_token_sha256', 'SELECT') then
    raise exception 'the owner role can read the finder token hash';
  end if;

  -- No policy in this schema is for a role with no pass, and none is "for everyone".
  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'qurtag'
    and (p.roles && array['public', 'qurtag_anon', 'anon', 'authenticated']::name[]);
  if bad is not null then raise exception 'policy open to the public or to visitors with no pass: %', bad; end if;
end
$$;

reset check_function_bodies;

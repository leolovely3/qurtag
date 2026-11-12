-- QuR Tag: the finder loop and owner safety (from the UX review of 25 October 2026). Applied after
-- db/qurtag.sql and rollout steps 3 to 12 (db/admin.sql, membership.sql, family.sql, support.sql,
-- push.sql, moderation.sql, admin-alerts.sql, shortcodes.sql, measures.sql), as `postgres`, in one
-- transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/13-ux-fixes.sql is this file plus a migration record.
--
-- What it adds, and why
--
--   A way back for the finder. A finder has no account, and the conversation lived only in the browser
--   that wrote the first note. Two things now bring them back:
--     * The conversation code. The server makes a short human-readable code for each new conversation
--       and derives the conversation token from it with a keyed hash (server/routes/finderLoop.ts), so
--       the database still holds only the token's SHA-256 and nothing new is stored for the code.
--       server_finder_resume turns a token derived from a typed code into the tag it belongs to. Wrong
--       codes are counted per visitor (a keyed hash of the network address, never the address) in
--       qurtag.short_code_tries, the table the short code lookup uses, under the same limits: 20 wrong
--       tries per visitor in 10 minutes and 600 a minute for everyone.
--     * An optional email, given by the finder after their note, so they are told when the owner
--       replies. threads.finder_email_enc holds the address and the conversation token encrypted by
--       the server (AES-256-GCM; the key never reaches the database). It is not a hash because the
--       server must send to the address, and it holds the token so the email can link straight back
--       to the conversation. No role the app uses can read the column: the owner's column rights on
--       threads are a fixed list, the server login reaches it only through the server_finder_*
--       functions below, and no owner, admin or finder function returns it. Each owner reply queues
--       one 'finder_reply' outbox row per conversation, at most one email per 10 minutes, so replies
--       written close together go in one email. The address is deleted when the conversation is
--       closed or the finder is blocked (at once), when the owner marks the thing returned (right
--       after the last email that says so), when the finder unsubscribes, and after 30 days without a
--       note (the daily sweep).
--
--   Stronger blocks. A block used to close one conversation token, and a finder who opened the tag in a
--   new window could start again. threads.finder_net_key keeps a keyed hash of the network address that
--   opened each conversation (made by the server; never the address, and cleared after 30 days). When
--   an owner or an admin blocks a finder, qurtag.finder_blocks refuses new conversations from that key
--   on any tag of the same household for 30 days. Unblocking removes it. The finder is told only that
--   the tag is not taking new notes, the same words as a paused tag, so a block is not announced.
--
--   Pause new notes. items.notes_paused_at: the owner can stop a tag taking new conversations (for
--   example after an unkind note) without switching it off. Existing conversations go on.
--
--   Finder page: the finder sees when the owner has read each of their notes ('seen'), whether the
--   item is paused, whether email is on (never the address), and a switched-off or replaced tag
--   answers 'gone' instead of the same answer as a code that never existed.
--
--   Owner inbox: threads.archived_at (the owner's own tidying; a new note from the finder brings the
--   conversation back), messages.sender_user_id (which family member wrote a reply, shown by name in a
--   Family inbox), and the held note's reason in my_held_notes (a threat shows safety advice).
--
-- Needs rollout steps 3 to 12.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.tag_print_events') is null then raise exception 'apply db/measures.sql (rollout step 12) first'; end if;
  if to_regclass('qurtag.message_reports') is null then raise exception 'apply db/moderation.sql (rollout step 9) first'; end if;
  if to_regclass('qurtag.short_code_tries') is null then raise exception 'apply db/shortcodes.sql (rollout step 10) first'; end if;
  if to_regclass('qurtag.finder_blocks') is not null then
    raise exception 'the finder loop changes are already installed; nothing was changed';
  end if;
end
$$;

-- 1. Columns and the block table ------------------------------------------------------------------

alter table qurtag.threads
  add column finder_net_key text check (finder_net_key is null or finder_net_key ~ '^[0-9a-f]{64}$'),
  add column archived_at timestamptz,
  add column finder_email_enc text check (finder_email_enc is null or (finder_email_enc ~ '^v1\.[A-Za-z0-9_-]+$' and length(finder_email_enc) between 40 and 1400)),
  add column finder_email_at timestamptz,
  add column finder_email_sent_at timestamptz,
  add constraint threads_finder_email_check check ((finder_email_enc is null) = (finder_email_at is null));

alter table qurtag.items add column notes_paused_at timestamptz;

alter table qurtag.messages add column sender_user_id uuid references qurtag.auth_users ("id") on delete set null;

create table qurtag.finder_blocks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references qurtag.households (id) on delete cascade,
  net_key text not null check (net_key ~ '^[0-9a-f]{64}$'),
  thread_id uuid references qurtag.threads (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index finder_blocks_lookup_idx on qurtag.finder_blocks (household_id, net_key, expires_at);
create index finder_blocks_thread_idx on qurtag.finder_blocks (thread_id);
alter table qurtag.finder_blocks enable row level security;

create index threads_finder_email_idx on qurtag.threads (last_message_at) where finder_email_enc is not null;
create index threads_net_key_idx on qurtag.threads (created_at) where finder_net_key is not null;

-- The owner reads and sets the archive mark. The pause mark is read with the item (the owner reads every
-- item column) and set only by set_item_notes_paused.
grant select (archived_at) on qurtag.threads to qurtag_user;
grant update (archived_at) on qurtag.threads to qurtag_user;

-- The outbox may now carry the finder's reply email.
alter table qurtag.outbox drop constraint outbox_kind_check;
alter table qurtag.outbox add constraint outbox_kind_check
  check (kind in ('finder_message', 'push_email', 'push_scan', 'admin_alert', 'finder_reply'));

-- 2. Triggers -------------------------------------------------------------------------------------

-- Queues the finder's reply email (at most one per 10 minutes per conversation; replies in between
-- wait for the same email), and brings an archived conversation back when the finder writes again.
create function qurtag.after_message_finder_loop() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_t qurtag.threads%rowtype;
begin
  select * into v_t from qurtag.threads where id = new.thread_id;
  if new.sender_kind = 'finder' and v_t.archived_at is not null then
    update qurtag.threads set archived_at = null where id = new.thread_id;
  elsif new.sender_kind = 'owner' and v_t.finder_email_enc is not null then
    perform qurtag.queue_finder_reply(new.thread_id, v_t.finder_email_sent_at);
  end if;
  return new;
end
$$;
create trigger messages_finder_loop after insert on qurtag.messages
  for each row execute function qurtag.after_message_finder_loop();

create function qurtag.queue_finder_reply(p_thread uuid, p_last_sent timestamptz) returns void
language sql volatile security definer set search_path = '' as $$
  insert into qurtag.outbox (kind, ref, next_attempt_at)
  select 'finder_reply', p_thread, greatest(now(), coalesce(p_last_sent + interval '10 minutes', now()))
  where not exists (select from qurtag.outbox o
                    where o.kind = 'finder_reply' and o.ref = p_thread and o.sent_at is null and o.attempts < 6)
$$;

-- When a conversation ends, the finder's email goes: at once when it is closed or the finder is
-- blocked; after one last email when the owner marks it returned. A block also refuses new
-- conversations from the same network for 30 days, and unblocking lifts that.
create function qurtag.threads_finder_loop() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.status = 'closed' and old.status is distinct from 'closed')
     or (new.blocked_at is not null and old.blocked_at is null) then
    new.finder_email_enc := null;
    new.finder_email_at := null;
  elsif new.status = 'reunited' and old.status is distinct from 'reunited' and new.finder_email_enc is not null then
    perform qurtag.queue_finder_reply(new.id, new.finder_email_sent_at);
  end if;
  if new.blocked_at is not null and old.blocked_at is null and new.finder_net_key is not null then
    insert into qurtag.finder_blocks (household_id, net_key, thread_id) values (new.household_id, new.finder_net_key, new.id);
  elsif new.blocked_at is null and old.blocked_at is not null then
    delete from qurtag.finder_blocks where thread_id = new.id;
  end if;
  return new;
end
$$;
create trigger threads_finder_loop before update on qurtag.threads
  for each row execute function qurtag.threads_finder_loop();

-- 3. The finder's side ---------------------------------------------------------------------------

-- As in db/moderation.sql, plus: each finder note says whether the owner has read it ('seen'); the item
-- says whether it is paused; the conversation says whether email is on (never the address); and a tag
-- that exists but is switched off or replaced answers {"gone": true}.
create or replace function qurtag.server_finder_view(p_public_id text, p_token text, p_device text, p_record_scan boolean)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_item qurtag.items%rowtype;
  v_thread qurtag.threads%rowtype;
  v_messages json;
begin
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then return null; end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id;
  if not found then return null; end if;
  if v_tag.status <> 'active' or v_tag.current_item_id is null then return json_build_object('gone', true); end if;
  select * into v_item from qurtag.items where id = v_tag.current_item_id;
  if not found then return json_build_object('gone', true); end if;
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
                                                 'created_at', m.created_at,
                                                 'seen', m.sender_kind = 'finder' and m.read_by_owner_at is not null)
                               order by m.created_at), '[]'::json)
      into v_messages from qurtag.messages m where m.thread_id = v_thread.id and m.hidden_at is null;
    end if;
  end if;
  return json_build_object(
    'item', json_build_object('name', v_item.name, 'photo', v_item.hero_photo_url,
                              'reward_text', v_item.reward_text, 'lost', v_item.lost_mode,
                              'paused', v_item.notes_paused_at is not null),
    'tag', json_build_object('public_id', v_tag.public_id),
    'thread', case when v_thread.id is null then null
                   else json_build_object('status', case when v_thread.blocked_at is not null then 'closed' else v_thread.status end,
                                          'messages', v_messages,
                                          'email_on', v_thread.finder_email_enc is not null) end
  );
end
$$;

-- Opens a conversation, as in db/moderation.sql, plus: p_net_key (a keyed hash of the network address,
-- made by the server) is kept on the conversation for 30 days; a paused item, or a network the household
-- blocked in the last 30 days, is refused with 'not_taking'.
drop function qurtag.server_finder_open(text, text, text, text);
create function qurtag.server_finder_open(p_public_id text, p_token text, p_body text, p_hold text default null, p_net_key text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_household uuid;
  v_paused timestamptz;
  v_thread uuid;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'bad_token'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if p_hold is not null and p_hold not in ('language', 'threat') then raise exception 'bad_token'; end if;
  if p_net_key is not null and p_net_key !~ '^[0-9a-f]{64}$' then raise exception 'bad_token'; end if;
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active' for share;
  if not found or v_tag.current_item_id is null then raise exception 'tag_not_found' using errcode = 'P0002'; end if;
  select household_id, notes_paused_at into v_household, v_paused from qurtag.items where id = v_tag.current_item_id;
  if v_paused is not null then raise exception 'not_taking'; end if;
  if p_net_key is not null and exists (
    select from qurtag.finder_blocks b
    where b.household_id = v_household and b.net_key = p_net_key and b.expires_at > now()
  ) then
    raise exception 'not_taking';
  end if;
  if (select count(*) from qurtag.threads t where t.tag_id = v_tag.id and t.created_at > now() - interval '1 day') >= 20
     or (select count(*) from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
         where t.tag_id = v_tag.id and m.sender_kind = 'finder' and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many';
  end if;
  insert into qurtag.threads (item_id, household_id, tag_id, finder_token_sha256, finder_net_key)
  values (v_tag.current_item_id, v_household, v_tag.id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), p_net_key)
  returning id into v_thread;
  insert into qurtag.messages (thread_id, sender_kind, body, held_at, held_reason)
  values (v_thread, 'finder', left(btrim(p_body), 2000), case when p_hold is not null then now() end, p_hold);
  return json_build_object('ok', true);
end
$$;

-- The tag a conversation token belongs to, for a finder who typed their conversation code on another
-- browser (the server derives the token from the code). A wrong code counts as a miss for the visitor
-- (p_key, a keyed hash made by the server) and for everyone, under the short code limits.
create function qurtag.server_finder_resume(p_token text, p_key text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(p_key, 'unknown');
  v_public text;
  v_minute timestamptz := date_trunc('minute', now());
begin
  if v_key <> 'unknown' and v_key !~ '^[0-9a-f]{64}$' then raise exception 'bad_key'; end if;
  if (select coalesce(sum(misses), 0) from qurtag.short_code_tries
      where key = v_key and minute > now() - interval '10 minutes') >= 20
     or (select coalesce(sum(misses), 0) from qurtag.short_code_tries
         where key = '*' and minute > now() - interval '1 minute') >= 600 then
    raise exception 'too_many';
  end if;
  if p_token is not null and length(p_token) between 32 and 128 then
    select t.public_id into v_public
    from qurtag.threads th join qurtag.tags t on t.id = th.tag_id
    where th.finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and t.status = 'active';
  end if;
  if v_public is null then
    insert into qurtag.short_code_tries (key, minute, misses) values (v_key, v_minute, 1)
      on conflict (key, minute) do update set misses = qurtag.short_code_tries.misses + 1;
    insert into qurtag.short_code_tries (key, minute, misses) values ('*', v_minute, 1)
      on conflict (key, minute) do update set misses = qurtag.short_code_tries.misses + 1;
  end if;
  return v_public;
end
$$;

-- The finder gives (or, with null, takes back) an email for their own conversation. Only an open,
-- unblocked conversation takes one. p_enc is the server's encryption of the address and the token.
create function qurtag.server_finder_set_email(p_public_id text, p_token text, p_enc text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_thread qurtag.threads%rowtype;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if p_enc is not null and (p_enc !~ '^v1\.[A-Za-z0-9_-]+$' or length(p_enc) not between 40 and 1400) then raise exception 'bad_token'; end if;
  select th.* into v_thread from qurtag.threads th
  join qurtag.tags t on t.id = th.tag_id and t.public_id = p_public_id and t.status = 'active'
  where th.finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update of th;
  if not found then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if p_enc is not null and (v_thread.blocked_at is not null or v_thread.status <> 'open') then
    raise exception 'thread_closed';
  end if;
  update qurtag.threads
  set finder_email_enc = p_enc,
      -- Replies written before the email was given are on the finder's page already: only later ones
      -- are emailed (server_finder_reply_due counts from this time).
      finder_email_at = case when p_enc is null then null else now() end
  where id = v_thread.id;
  return json_build_object('ok', true, 'email_on', p_enc is not null);
end
$$;

-- For the outbox: what the finder's reply email needs, or null when there is no address any more.
-- The owner's replies since the last email (or since the address was given), oldest first, at most 5.
create function qurtag.server_finder_reply_due(p_thread uuid)
returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'enc', th.finder_email_enc,
    'public_id', t.public_id,
    'item_name', i.name,
    'status', case when th.blocked_at is not null then 'closed' else th.status end,
    'upto', now(),
    'replies', coalesce((
      select json_agg(x.body order by x.created_at) from (
        select m.body, m.created_at from qurtag.messages m
        where m.thread_id = th.id and m.sender_kind = 'owner' and m.hidden_at is null
          and m.created_at > greatest(th.finder_email_at, coalesce(th.finder_email_sent_at, th.finder_email_at))
        order by m.created_at limit 5) x), '[]'::json),
    'more', (select count(*) from qurtag.messages m
             where m.thread_id = th.id and m.sender_kind = 'owner' and m.hidden_at is null
               and m.created_at > greatest(th.finder_email_at, coalesce(th.finder_email_sent_at, th.finder_email_at))) > 5)
  from qurtag.threads th
  join qurtag.tags t on t.id = th.tag_id
  join qurtag.items i on i.id = th.item_id
  where th.id = p_thread and th.finder_email_enc is not null and th.blocked_at is null
$$;

-- For the outbox: the email went (p_upto is the 'upto' the due function answered). A conversation
-- that is no longer open forgets the address now that its last email is sent. A reply written while
-- this email was being sent is queued for the next one, 10 minutes on.
create function qurtag.server_finder_reply_sent(p_thread uuid, p_upto timestamptz)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_t qurtag.threads%rowtype;
begin
  update qurtag.threads
  set finder_email_sent_at = greatest(coalesce(finder_email_sent_at, p_upto), p_upto),
      finder_email_enc = case when status = 'open' and blocked_at is null then finder_email_enc end,
      finder_email_at = case when status = 'open' and blocked_at is null then finder_email_at end
  where id = p_thread
  returning * into v_t;
  if found and v_t.finder_email_enc is not null and exists (
    select from qurtag.messages m
    where m.thread_id = p_thread and m.sender_kind = 'owner' and m.created_at > p_upto
  ) then
    insert into qurtag.outbox (kind, ref, next_attempt_at)
    values ('finder_reply', p_thread, p_upto + interval '10 minutes');
  end if;
end
$$;

-- The finder's "Stop these emails" link (the server checks its signature first).
create function qurtag.server_finder_email_forget(p_thread uuid)
returns boolean
language sql volatile security definer set search_path = '' as $$
  with x as (
    update qurtag.threads set finder_email_enc = null, finder_email_at = null
    where id = p_thread and finder_email_enc is not null
    returning 1)
  select exists (select from x)
$$;

-- The daily sweep: finder emails of conversations with no note for 30 days, or that ended more than a
-- day ago (when the last email could not be sent); network keys older than 30 days; expired blocks.
create function qurtag.server_finder_sweep()
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_emails integer;
  v_keys integer;
  v_blocks integer;
begin
  update qurtag.threads set finder_email_enc = null, finder_email_at = null
  where finder_email_enc is not null
    and (last_message_at < now() - interval '30 days'
         or ((status <> 'open' or blocked_at is not null) and last_message_at < now() - interval '1 day'));
  get diagnostics v_emails = row_count;
  update qurtag.threads set finder_net_key = null
  where finder_net_key is not null and created_at < now() - interval '30 days';
  get diagnostics v_keys = row_count;
  delete from qurtag.finder_blocks where expires_at <= now();
  get diagnostics v_blocks = row_count;
  return json_build_object('finder_emails_deleted', v_emails, 'network_keys_cleared', v_keys, 'blocks_expired', v_blocks);
end
$$;

-- 4. The owner's side ----------------------------------------------------------------------------

-- "Pause new notes" on an item (and so on its tag), or take the pause off.
create function qurtag.set_item_notes_paused(p_item uuid, p_paused boolean)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  if qurtag.current_account() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update qurtag.items
  set notes_paused_at = case when coalesce(p_paused, false) then coalesce(notes_paused_at, now()) end
  where id = p_item and household_id in (select qurtag.my_household_ids())
  returning notes_paused_at into v_at;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return json_build_object('item_id', p_item, 'paused', v_at is not null);
end
$$;

-- As in db/qurtag.sql, and the reply records who wrote it (a Family inbox shows the name).
create or replace function qurtag.owner_reply(p_thread_id uuid, p_body text)
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
  insert into qurtag.messages (thread_id, sender_kind, body, sender_user_id)
  values (p_thread_id, 'owner', left(btrim(p_body), 2000), qurtag.current_account())
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread_id and sender_kind = 'finder' and read_by_owner_at is null;
  return v_id;
end
$$;

-- As in db/push.sql (a reply from an iPhone alert), and the reply records who wrote it.
create or replace function qurtag.server_owner_reply(p_user uuid, p_session uuid, p_thread uuid, p_body text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not qurtag.push_session_ok(p_user, p_session) then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if not exists (
    select from qurtag.threads t
    where t.id = p_thread and t.household_id in (
      select hm.household_id from qurtag.household_members hm
      where hm.user_id = p_user and (hm.role = 'admin' or qurtag.household_plan(hm.household_id) = 'family'))
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into qurtag.messages (thread_id, sender_kind, body, sender_user_id)
  values (p_thread, 'owner', left(btrim(p_body), 2000), p_user)
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread and sender_kind = 'finder' and read_by_owner_at is null;
  return json_build_object('message_id', v_id, 'unread', qurtag.push_unread_for(p_user));
end
$$;

-- As in db/moderation.sql, plus the reason the filter held each note ('language' or 'threat'), so a
-- threat shows safety advice. Still never the text.
create or replace function qurtag.my_held_notes(p_thread uuid default null) returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.created_at), '[]'::json) from (
    select m.id, m.thread_id, m.created_at, m.read_by_owner_at is not null as read, m.held_reason as reason
    from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
    where m.held_at is not null and m.held_released_at is null and m.hidden_at is null and m.owner_hidden_at is null
      and t.blocked_at is null and t.household_id in (select qurtag.my_household_ids())
      and (p_thread is null or m.thread_id = p_thread)
  ) x
$$;

-- 5. Rights -----------------------------------------------------------------------------------------

revoke all on function
  qurtag.after_message_finder_loop(), qurtag.queue_finder_reply(uuid, timestamptz), qurtag.threads_finder_loop(),
  qurtag.server_finder_open(text, text, text, text, text), qurtag.server_finder_resume(text, text),
  qurtag.server_finder_set_email(text, text, text), qurtag.server_finder_reply_due(uuid),
  qurtag.server_finder_reply_sent(uuid, timestamptz), qurtag.server_finder_email_forget(uuid),
  qurtag.server_finder_sweep(), qurtag.set_item_notes_paused(uuid, boolean)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.finder_blocks from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function
  qurtag.server_finder_open(text, text, text, text, text), qurtag.server_finder_resume(text, text),
  qurtag.server_finder_set_email(text, text, text), qurtag.server_finder_reply_due(uuid),
  qurtag.server_finder_reply_sent(uuid, timestamptz), qurtag.server_finder_email_forget(uuid),
  qurtag.server_finder_sweep()
  to qurtag_server;
grant execute on function qurtag.set_item_notes_paused(uuid, boolean) to qurtag_user;

-- 6. Checks before finishing --------------------------------------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.finder_blocks', 'SELECT') or has_table_privilege(r.oid, 'qurtag.finder_blocks', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.finder_blocks', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.finder_blocks', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on qurtag.finder_blocks: %', bad; end if;
  select string_agg(r.rolname || '.' || c.col, ', ') into bad
  from pg_roles r cross join unnest(array['finder_email_enc', 'finder_email_at', 'finder_email_sent_at', 'finder_net_key', 'finder_token_sha256']) c(col)
  where r.rolname like 'qurtag\_%'
    and (has_column_privilege(r.oid, 'qurtag.threads', c.col, 'SELECT') or has_column_privilege(r.oid, 'qurtag.threads', c.col, 'UPDATE'));
  if bad is not null then raise exception 'a role can reach a finder''s private column: %', bad; end if;
  if has_column_privilege('qurtag_user', 'qurtag.items', 'notes_paused_at', 'UPDATE') then
    raise exception 'the owner role can set the pause mark directly';
  end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_finder_reply_due(uuid)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.server_finder_set_email(text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_user', 'qurtag.server_finder_open(text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.set_item_notes_paused(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.set_item_notes_paused(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('qurtag_user', 'qurtag.queue_finder_reply(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.queue_finder_reply(uuid, timestamptz)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'qurtag'
    and (p.roles && array['public', 'qurtag_anon', 'anon', 'authenticated']::name[]);
  if bad is not null then raise exception 'policy open to the public or to visitors with no pass: %', bad; end if;
end
$$;

reset check_function_bodies;

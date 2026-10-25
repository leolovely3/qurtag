-- QuR Tag: moderation of finders' notes (App Store guideline 1.2, user-generated content).
-- Applied after db/qurtag.sql, db/admin.sql (rollout step 3), db/support.sql (step 7) and
-- db/push.sql (step 8), as `postgres`, in one transaction. It refuses to run twice. The rollout
-- file ~/Claude/Rollouts/QurTag-rollout-schema/9-moderation.sql is this file plus a migration record.
--
-- Why it exists: a finder is an anonymous stranger who writes to an owner. Apple requires a way to
-- filter objectionable material, to report it and be answered in time, to block abusive users, and
-- published contact details. This file is the database half; the screens, the word list and the
-- terms are in the app (server/moderation/, src/routes/app/InboxThread.tsx, Settings.tsx, Admin.tsx,
-- Terms.tsx, Help.tsx).
--
-- What it adds
--   qurtag.message_reports   one row per report of a finder's note by a household: the reason
--                            (harassment, spam, threats, inappropriate, other), an optional comment,
--                            open or closed and how it was closed (hidden for everyone, dismissed,
--                            finder blocked). No role the app uses has any right on the table.
--   messages.owner_hidden_at a reported note is hidden from the owner who reported it at once (the
--                            owner's read policy honours it); the finder still sees their own note
--                            until a Super Admin hides it for everyone (messages.hidden_at, step 3).
--   messages.held_*          a note the server's filter flagged (a slur or a threat) is stored but
--                            held: the owner's read policy leaves it out until the owner chooses
--                            "Show it" (release_held_note). The words never reach the owner's phone
--                            before that, and a notification for a held note carries no text.
--   threads.blocked_*        "Block this finder": the conversation's token can no longer write
--                            (a trigger on messages refuses it, whichever function inserts), the
--                            finder's notes disappear from the owner's inbox, and the finder is told
--                            only "This conversation is closed". The owner can unblock from Settings,
--                            unless a Super Admin blocked the finder.
--   Limits in server_finder_post and server_finder_open: 5 notes a minute and 30 an hour per
--     conversation, 60 notes an hour per tag (the 20 new conversations per tag a day stay), and an
--     identical note repeated within 10 minutes is not stored twice. The finder's filter (word list,
--     links) runs in the server route, which passes the reason to hold a note.
--   admin_reports_list / admin_report_resolve   the Super Admin queue (oldest first) with Hide for
--     everyone, Dismiss and Block finder; each checks for a super admin in the database and writes to
--     the admin log.
--   factory_metrics          also answers reports_open, reports_oldest_open_days and reports_30d, and
--     counts open reports in the support figures (support_open, support_30d, support_oldest_open_days)
--     the Company OS support queue reads, because that contract has no other field: an unanswered
--     report is a support item that must be answered within 24 hours.
--
-- Needs rollout steps 3, 7 and 8.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.admin_audit') is null then raise exception 'apply db/admin.sql (rollout step 3) first'; end if;
  if to_regclass('qurtag.support_requests') is null then raise exception 'apply db/support.sql (rollout step 7) first'; end if;
  if to_regclass('qurtag.push_devices') is null then raise exception 'apply db/push.sql (rollout step 8) first'; end if;
  if to_regclass('qurtag.message_reports') is not null then
    raise exception 'moderation is already installed; nothing was changed';
  end if;
end
$$;

-- 1. Tables and marks -----------------------------------------------------------------------------

alter table qurtag.threads
  add column blocked_at timestamptz,
  add column blocked_by uuid,
  add column blocked_by_admin boolean not null default false;

alter table qurtag.messages
  add column owner_hidden_at timestamptz,
  add column held_at timestamptz,
  add column held_reason text check (held_reason is null or held_reason in ('language', 'threat')),
  add column held_released_at timestamptz,
  add constraint messages_held_check check (held_reason is null or held_at is not null);

create table qurtag.message_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references qurtag.messages (id) on delete cascade,
  thread_id uuid not null references qurtag.threads (id) on delete cascade,
  household_id uuid not null references qurtag.households (id) on delete cascade,
  reporter_user_id uuid references qurtag.auth_users ("id") on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'threats', 'inappropriate', 'other')),
  comment text check (comment is null or length(comment) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  resolution text check (resolution is null or resolution in ('hidden', 'dismissed', 'blocked')),
  resolved_at timestamptz,
  resolved_by uuid,
  check ((status = 'closed') = (resolved_at is not null)),
  check ((status = 'closed') = (resolution is not null)),
  unique (message_id, household_id)
);
create index message_reports_open_idx on qurtag.message_reports (created_at) where status = 'open';
create index message_reports_created_idx on qurtag.message_reports (created_at desc);
alter table qurtag.message_reports enable row level security;

-- The admin log may now name these actions and these kinds of target.
alter table qurtag.admin_audit drop constraint admin_audit_action_check;
alter table qurtag.admin_audit add constraint admin_audit_action_check check (action in (
  'view_overview', 'list_accounts', 'view_account',
  'disable_tag', 'enable_tag', 'hide_message', 'unhide_message', 'delete_account',
  'list_support_requests', 'close_support_request',
  'list_reports', 'dismiss_report', 'block_finder'));
alter table qurtag.admin_audit drop constraint admin_audit_target_type_check;
alter table qurtag.admin_audit add constraint admin_audit_target_type_check
  check (target_type in ('account', 'tag', 'message', 'support_request', 'report', 'thread'));

-- 2. What the owner reads ------------------------------------------------------------------------

-- The owner role reads a conversation's block mark only inside the policies below.
grant select (blocked_at) on qurtag.threads to qurtag_user;

-- A blocked finder's conversation is gone from the owner's inbox.
drop policy own_threads_read on qurtag.threads;
create policy own_threads_read on qurtag.threads for select to qurtag_user
  using (household_id in (select qurtag.my_household_ids()) and blocked_at is null);

-- Not in the owner's reads: a note an admin hid, a note the owner reported, a note held by the
-- filter until the owner chose to show it, and anything in a blocked conversation.
drop policy own_messages_read on qurtag.messages;
create policy own_messages_read on qurtag.messages for select to qurtag_user
  using (hidden_at is null
         and owner_hidden_at is null
         and (held_at is null or held_released_at is not null)
         and thread_id in (select t.id from qurtag.threads t
                           where t.household_id in (select qurtag.my_household_ids()) and t.blocked_at is null));

-- 3. A blocked conversation takes no more notes, from either side ----------------------------------------

create function qurtag.guard_blocked_thread() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_kind in ('finder', 'owner') and exists (
    select from qurtag.threads t where t.id = new.thread_id and t.blocked_at is not null
  ) then
    raise exception 'thread_blocked';
  end if;
  return new;
end
$$;
create trigger messages_guard_blocked before insert on qurtag.messages
  for each row execute function qurtag.guard_blocked_thread();

-- 4. The finder's side ----------------------------------------------------------------------------

-- As in db/admin.sql, except that a blocked conversation looks closed to the finder.
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
      into v_messages from qurtag.messages m where m.thread_id = v_thread.id and m.hidden_at is null;
    end if;
  end if;
  return json_build_object(
    'item', json_build_object('name', v_item.name, 'photo', v_item.hero_photo_url,
                              'reward_text', v_item.reward_text, 'lost', v_item.lost_mode),
    'tag', json_build_object('public_id', v_tag.public_id),
    'thread', case when v_thread.id is null then null
                   else json_build_object('status', case when v_thread.blocked_at is not null then 'closed' else v_thread.status end,
                                          'messages', v_messages) end
  );
end
$$;

-- The 3-argument finder functions become 4-argument ones: the last argument is the reason the
-- server's filter flagged the note (null, 'language' or 'threat'). A flagged note is stored held.
drop function qurtag.server_finder_open(text, text, text);
drop function qurtag.server_finder_post(text, text, text);

-- Opens a conversation with its first note. At most 20 new conversations per tag per day and 60
-- finder notes per tag per hour, so a tag cannot be used to flood an owner.
create function qurtag.server_finder_open(p_public_id text, p_token text, p_body text, p_hold text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_household uuid;
  v_thread uuid;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'bad_token'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if p_hold is not null and p_hold not in ('language', 'threat') then raise exception 'bad_token'; end if;
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active' for share;
  if not found or v_tag.current_item_id is null then raise exception 'tag_not_found' using errcode = 'P0002'; end if;
  select household_id into v_household from qurtag.items where id = v_tag.current_item_id;
  if (select count(*) from qurtag.threads t where t.tag_id = v_tag.id and t.created_at > now() - interval '1 day') >= 20
     or (select count(*) from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
         where t.tag_id = v_tag.id and m.sender_kind = 'finder' and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many';
  end if;
  insert into qurtag.threads (item_id, household_id, tag_id, finder_token_sha256)
  values (v_tag.current_item_id, v_household, v_tag.id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
  returning id into v_thread;
  insert into qurtag.messages (thread_id, sender_kind, body, held_at, held_reason)
  values (v_thread, 'finder', left(btrim(p_body), 2000), case when p_hold is not null then now() end, p_hold);
  return json_build_object('ok', true);
end
$$;

-- Adds a finder's note to their own conversation. Refused when the owner blocked the finder (the
-- same words as a closed conversation). At most 5 notes a minute and 30 an hour per conversation and
-- 60 an hour per tag; an identical note within 10 minutes is accepted but not stored twice.
create function qurtag.server_finder_post(p_public_id text, p_token text, p_body text, p_hold text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_thread qurtag.threads%rowtype;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if p_hold is not null and p_hold not in ('language', 'threat') then raise exception 'bad_token'; end if;
  select th.* into v_thread from qurtag.threads th
  join qurtag.tags t on t.id = th.tag_id and t.public_id = p_public_id and t.status = 'active'
  where th.finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then raise exception 'thread_not_found' using errcode = 'P0002'; end if;
  if v_thread.blocked_at is not null then raise exception 'thread_blocked'; end if;
  if v_thread.status = 'closed' then raise exception 'thread_closed'; end if;
  if (select count(*) from qurtag.messages m where m.thread_id = v_thread.id and m.sender_kind = 'finder'
        and m.created_at > now() - interval '1 hour') >= 30
     or (select count(*) from qurtag.messages m where m.thread_id = v_thread.id and m.sender_kind = 'finder'
           and m.created_at > now() - interval '1 minute') >= 5
     or (select count(*) from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
         where t.tag_id = v_thread.tag_id and m.sender_kind = 'finder' and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many';
  end if;
  if exists (select from qurtag.messages m where m.thread_id = v_thread.id and m.sender_kind = 'finder'
               and m.body = left(btrim(p_body), 2000) and m.created_at > now() - interval '10 minutes') then
    return json_build_object('ok', true);
  end if;
  insert into qurtag.messages (thread_id, sender_kind, body, held_at, held_reason)
  values (v_thread.id, 'finder', left(btrim(p_body), 2000), case when p_hold is not null then now() end, p_hold);
  return json_build_object('ok', true);
end
$$;

-- As in db/push.sql, except that a held note's text is left out, so an alert never carries it.
create or replace function qurtag.server_note_recipients(p_message uuid)
returns table (user_id uuid, email text, item_name text, thread_id uuid, body text, is_first boolean,
               found_on boolean, message_on boolean, hide_text boolean, email_copy boolean,
               unread integer, devices json, handled boolean)
language sql stable security definer set search_path = '' as $$
  select u."id", u."email", i.name, t.id, case when m.held_at is null then m.body else '' end,
         not exists (select from qurtag.messages x
                     where x.thread_id = m.thread_id and x.sender_kind = 'finder' and x.id <> m.id
                       and (x.created_at, x.id) < (m.created_at, m.id)),
         coalesce(s.found_on, true), coalesce(s.message_on, true), coalesce(s.hide_text, false), coalesce(s.email_copy, true),
         qurtag.push_unread_for(u."id"),
         coalesce((select json_agg(json_build_object('token', d.token, 'environment', d.environment) order by d.last_seen_at desc)
                   from qurtag.push_devices d where d.user_id = u."id"), '[]'::json),
         -- Already alerted or emailed for this note (an earlier try of the same outbox row).
         exists (select from qurtag.note_alerts a
                 where a.message_id = m.id and a.user_id = u."id" and (a.push_sent or a.emailed_at is not null))
  from qurtag.messages m
  join qurtag.threads t on t.id = m.thread_id
  join qurtag.items i on i.id = t.item_id
  join qurtag.household_members hm on hm.household_id = t.household_id
  join qurtag.auth_users u on u."id" = hm.user_id
  left join qurtag.push_settings s on s.user_id = u."id"
  where m.id = p_message and m.sender_kind = 'finder'
    and (hm.role = 'admin' or qurtag.household_plan(t.household_id) = 'family')
$$;

-- 5. The owner's tools (qurtag_user) ------------------------------------------------------------------

-- Reports a finder's note. It is hidden from the owner at once and goes to the Super Admin queue.
-- Reporting the same note twice from one household is the same report. At most 30 reports an hour.
create function qurtag.report_message(p_message uuid, p_reason text, p_comment text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_thread uuid;
  v_household uuid;
  v_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('harassment', 'spam', 'threats', 'inappropriate', 'other') then
    raise exception 'bad_reason';
  end if;
  if v_comment is not null and length(v_comment) > 1000 then raise exception 'too_long'; end if;
  select m.thread_id, t.household_id into v_thread, v_household
  from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
  where m.id = p_message and m.sender_kind = 'finder' and t.household_id in (select qurtag.my_household_ids());
  if v_thread is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from qurtag.message_reports r
      where r.reporter_user_id = v_me and r.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many';
  end if;
  insert into qurtag.message_reports (message_id, thread_id, household_id, reporter_user_id, reason, comment)
  values (p_message, v_thread, v_household, v_me, p_reason, v_comment)
  on conflict (message_id, household_id) do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from qurtag.message_reports r where r.message_id = p_message and r.household_id = v_household;
  end if;
  update qurtag.messages
  set owner_hidden_at = coalesce(owner_hidden_at, now()), read_by_owner_at = coalesce(read_by_owner_at, now())
  where id = p_message;
  return json_build_object('id', v_id, 'thread_id', v_thread, 'hidden', true);
end
$$;

-- Blocks the finder of a conversation in one of the owner's households.
create function qurtag.block_finder(p_thread uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update qurtag.threads
  set blocked_at = coalesce(blocked_at, now()), blocked_by = coalesce(blocked_by, v_me)
  where id = p_thread and household_id in (select qurtag.my_household_ids());
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread and sender_kind = 'finder' and read_by_owner_at is null;
  return json_build_object('thread_id', p_thread, 'blocked', true);
end
$$;

-- Unblocks a finder the owner blocked. A finder a Super Admin blocked stays blocked.
create function qurtag.unblock_finder(p_thread uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_admin boolean;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select t.blocked_by_admin into v_admin from qurtag.threads t
  where t.id = p_thread and t.blocked_at is not null and t.household_id in (select qurtag.my_household_ids());
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_admin then raise exception 'blocked_by_admin' using errcode = '42501'; end if;
  update qurtag.threads set blocked_at = null, blocked_by = null where id = p_thread;
  return json_build_object('thread_id', p_thread, 'blocked', false);
end
$$;

-- The finders the owner's households have blocked. Nothing that identifies a finder: the item the
-- conversation was about, when it started, when it was blocked and how many notes it holds.
create function qurtag.my_blocked_finders() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.blocked_at desc), '[]'::json) from (
    select t.id as thread_id, i.name as item_name, t.created_at as started_at, t.blocked_at, t.blocked_by_admin as by_admin,
           (select count(*) from qurtag.messages m where m.thread_id = t.id and m.sender_kind = 'finder') as notes
    from qurtag.threads t join qurtag.items i on i.id = t.item_id
    where t.blocked_at is not null and t.household_id in (select qurtag.my_household_ids())
  ) x
$$;

-- Notes the filter held, without their text: the owner chooses whether to show each one.
-- p_thread null means every conversation of the owner's households.
create function qurtag.my_held_notes(p_thread uuid default null) returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.created_at), '[]'::json) from (
    select m.id, m.thread_id, m.created_at, m.read_by_owner_at is not null as read
    from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
    where m.held_at is not null and m.held_released_at is null and m.hidden_at is null and m.owner_hidden_at is null
      and t.blocked_at is null and t.household_id in (select qurtag.my_household_ids())
      and (p_thread is null or m.thread_id = p_thread)
  ) x
$$;

-- "This note may be offensive. Show it?" Yes.
create function qurtag.release_held_note(p_message uuid) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if qurtag.current_account() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update qurtag.messages m set held_released_at = coalesce(m.held_released_at, now())
  from qurtag.threads t
  where m.id = p_message and m.held_at is not null and t.id = m.thread_id
    and t.blocked_at is null and t.household_id in (select qurtag.my_household_ids());
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return json_build_object('id', p_message, 'shown', true);
end
$$;

-- 6. The Super Admin queue ----------------------------------------------------------------------------

-- Reports, oldest open first. p_status: 'open' (default) or 'closed'. At most 200.
create function qurtag.admin_reports_list(p_status text default 'open') returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_status text := coalesce(p_status, 'open');
begin
  if v_status not in ('open', 'closed') then raise exception 'bad_request'; end if;
  perform qurtag.admin_log(v_me, 'list_reports', null, null, jsonb_build_object('status', v_status));
  return json_build_object(
    'open', (select count(*) from qurtag.message_reports where status = 'open'),
    'reports', coalesce((
      select json_agg(x) from (
        select r.id, r.created_at, r.reason, r.comment, r.status, r.resolution, r.resolved_at,
               m.id as message_id, m.body as message_text, m.created_at as message_at,
               m.hidden_at is not null as hidden_for_everyone, m.held_at is not null as was_held,
               r.thread_id, th.blocked_at is not null as finder_blocked,
               i.id as item_id, i.name as item_name,
               (select u."email" from qurtag.auth_users u where u."id" = r.reporter_user_id) as reporter_email
        from qurtag.message_reports r
        join qurtag.messages m on m.id = r.message_id
        join qurtag.threads th on th.id = r.thread_id
        join qurtag.items i on i.id = th.item_id
        where r.status = v_status
        order by case when v_status = 'open' then r.created_at end asc, r.resolved_at desc
        limit 200) x), '[]'::json));
end
$$;

-- Acts on an open report: 'hide' (hide the note for everyone), 'dismiss', or 'block' (block the
-- finder; the owner cannot unblock). The report closes, and the action is written to the admin log
-- in the same step.
create function qurtag.admin_report_resolve(p_id uuid, p_action text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_r qurtag.message_reports%rowtype;
begin
  if p_action is null or p_action not in ('hide', 'dismiss', 'block') then raise exception 'bad_request'; end if;
  select * into v_r from qurtag.message_reports where id = p_id and status = 'open' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action = 'hide' then
    update qurtag.messages set hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, v_me)
    where id = v_r.message_id;
    perform qurtag.admin_log(v_me, 'hide_message', 'message', v_r.message_id::text,
                             jsonb_build_object('report_id', v_r.id, 'reason', v_r.reason));
  elsif p_action = 'dismiss' then
    perform qurtag.admin_log(v_me, 'dismiss_report', 'report', v_r.id::text, jsonb_build_object('reason', v_r.reason));
  else
    update qurtag.threads
    set blocked_at = coalesce(blocked_at, now()), blocked_by = coalesce(blocked_by, v_me), blocked_by_admin = true
    where id = v_r.thread_id;
    perform qurtag.admin_log(v_me, 'block_finder', 'thread', v_r.thread_id::text,
                             jsonb_build_object('report_id', v_r.id, 'reason', v_r.reason));
  end if;
  update qurtag.message_reports
  set status = 'closed', resolved_at = now(), resolved_by = v_me,
      resolution = case p_action when 'hide' then 'hidden' when 'dismiss' then 'dismissed' else 'blocked' end
  where id = v_r.id;
  return json_build_object('id', v_r.id, 'status', 'closed', 'action', p_action);
end
$$;

-- 7. The Company OS counts ------------------------------------------------------------------------------

create or replace function qurtag.factory_metrics(p_token text) returns json
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
    'owner_replies_30d', (select count(*) from qurtag.messages where sender_kind = 'owner' and created_at > now() - interval '30 days'),
    -- The support queue: Contact us requests and reports of finders' notes together, because the Company
    -- OS reads only these three names. Open now, received in 30 days, and the age in whole days of the
    -- oldest open one of either kind.
    'support_open', (select count(*) from qurtag.support_requests where status = 'open')
                    + (select count(*) from qurtag.message_reports where status = 'open'),
    'support_30d', (select count(*) from qurtag.support_requests where created_at > now() - interval '30 days')
                   + (select count(*) from qurtag.message_reports where created_at > now() - interval '30 days'),
    'support_oldest_open_days', (select floor(extract(epoch from now() - min(c)) / 86400)::int from (
                                   select created_at as c from qurtag.support_requests where status = 'open'
                                   union all
                                   select created_at from qurtag.message_reports where status = 'open') q),
    -- The reports on their own, for the 24 hour promise to Apple and to owners.
    'reports_open', (select count(*) from qurtag.message_reports where status = 'open'),
    'reports_30d', (select count(*) from qurtag.message_reports where created_at > now() - interval '30 days'),
    'reports_oldest_open_days', (select floor(extract(epoch from now() - min(created_at)) / 86400)::int
                                 from qurtag.message_reports where status = 'open')
  );
end
$$;

-- 8. Rights -------------------------------------------------------------------------------------------

-- A new function can be run by everyone until that is taken away, so take it away from every new
-- function, then give each to the one login that uses it.
revoke all on function
  qurtag.guard_blocked_thread(),
  qurtag.server_finder_open(text, text, text, text), qurtag.server_finder_post(text, text, text, text),
  qurtag.report_message(uuid, text, text), qurtag.block_finder(uuid), qurtag.unblock_finder(uuid),
  qurtag.my_blocked_finders(), qurtag.my_held_notes(uuid), qurtag.release_held_note(uuid),
  qurtag.admin_reports_list(text), qurtag.admin_report_resolve(uuid, text)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.message_reports from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function
  qurtag.report_message(uuid, text, text), qurtag.block_finder(uuid), qurtag.unblock_finder(uuid),
  qurtag.my_blocked_finders(), qurtag.my_held_notes(uuid), qurtag.release_held_note(uuid),
  qurtag.admin_reports_list(text), qurtag.admin_report_resolve(uuid, text)
  to qurtag_user;
grant execute on function
  qurtag.server_finder_open(text, text, text, text), qurtag.server_finder_post(text, text, text, text)
  to qurtag_server;

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.message_reports', 'SELECT') or has_table_privilege(r.oid, 'qurtag.message_reports', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.message_reports', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.message_reports', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on the reports table: %', bad; end if;
  if exists (select from pg_policies p where p.schemaname = 'qurtag' and p.tablename = 'message_reports') then
    raise exception 'a policy exists on the reports table';
  end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_finder_post(text, text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.report_message(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.admin_report_resolve(uuid, text)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.block_finder(uuid)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
  if has_column_privilege('qurtag_user', 'qurtag.threads', 'blocked_at', 'UPDATE')
     or has_column_privilege('qurtag_user', 'qurtag.threads', 'blocked_by_admin', 'SELECT')
     or has_column_privilege('qurtag_user', 'qurtag.messages', 'held_released_at', 'UPDATE')
     or has_column_privilege('qurtag_user', 'qurtag.messages', 'owner_hidden_at', 'UPDATE')
     or has_column_privilege('qurtag_user', 'qurtag.threads', 'finder_token_sha256', 'SELECT') then
    raise exception 'an owner can change or read a moderation mark it must not';
  end if;
  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'qurtag'
    and (p.roles && array['public', 'qurtag_anon', 'anon', 'authenticated']::name[]);
  if bad is not null then raise exception 'policy open to the public or to visitors with no pass: %', bad; end if;
end
$$;

reset check_function_bodies;

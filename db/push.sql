-- QuR Tag: iPhone push notifications. Applied after db/qurtag.sql, db/membership.sql and
-- db/family.sql (rollout steps 1 to 6), as `postgres`, in one transaction. It refuses to run
-- twice. The rollout file ~/Claude/Rollouts/QurTag-rollout-schema/8-push.sql is this file plus
-- a migration record.
--
-- What it adds
--   qurtag.push_devices      one row per iPhone that allowed alerts: the account, Apple's device
--                            token, whether the build talks to Apple's sandbox or production
--                            server, and when it was first and last seen. A token is kept until
--                            the person signs out, deletes the account, or Apple says the token
--                            is gone. No role the app uses has any right on the table, so no
--                            screen and no request can read a token; only server_push_* can.
--   qurtag.push_settings     each person's own choices: found, new message, tag scanned (off by
--                            default), hide note text on the lock screen, and the email copy.
--   qurtag.note_alerts       per note and per person: did a push go out, and has the email copy
--                            been sent. It is how "email only if the alert was not opened in 10
--                            minutes" is decided without sending twice.
--   qurtag.push_scan_marks   when each person was last told that a tag was scanned, so a tag
--                            alerts a person at most once an hour.
--   the outbox               gains two kinds of work: push_email (the email copy, due 10 minutes
--                            after the note) and push_scan (the scan alert, due 2 minutes after
--                            the scan, dropped if the finder sent a note meanwhile).
--   server_push_*            what the server routes call as `qurtag_server` (which has no table
--                            rights): register or forget a token, list who to alert for a note or
--                            a scan, record what was sent, and post an owner's reply from the
--                            notification.
--   my_push_settings / set_push_settings
--                            what the Settings screen calls as `qurtag_user`.
--
-- Who is alerted: everyone who can read the household's inbox, the same people the note email
-- reaches (the owner and, while the household is on the Family plan, every member), each by
-- their own settings.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.household_invites') is null then
    raise exception 'apply db/membership.sql and db/family.sql (rollout steps 5 and 6) first';
  end if;
  if to_regclass('qurtag.push_devices') is not null then
    raise exception 'push notifications are already installed; nothing was changed';
  end if;
end
$$;

-- 1. Tables -------------------------------------------------------------------------------------

create table qurtag.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  -- Apple's device token, as hex. Never leaves the server.
  token text not null unique check (token ~ '^[0-9a-f]{32,200}$'),
  -- Which Apple server the build registered with: Xcode builds are sandbox, TestFlight and the App Store production.
  environment text not null check (environment in ('sandbox', 'production')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_devices_user_idx on qurtag.push_devices (user_id);
alter table qurtag.push_devices enable row level security;

create table qurtag.push_settings (
  user_id uuid primary key references qurtag.auth_users ("id") on delete cascade,
  found_on boolean not null default true,
  message_on boolean not null default true,
  scan_on boolean not null default false,
  hide_text boolean not null default false,
  email_copy boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table qurtag.push_settings enable row level security;

create table qurtag.note_alerts (
  message_id uuid not null references qurtag.messages (id) on delete cascade,
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  push_sent boolean not null default false,
  emailed_at timestamptz,
  primary key (message_id, user_id)
);
alter table qurtag.note_alerts enable row level security;

create table qurtag.push_scan_marks (
  tag_id uuid not null references qurtag.tags (id) on delete cascade,
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (tag_id, user_id)
);
alter table qurtag.push_scan_marks enable row level security;

-- 2. The outbox and the triggers that fill it ---------------------------------------------------

alter table qurtag.outbox drop constraint outbox_kind_check;
alter table qurtag.outbox add constraint outbox_kind_check check (kind in ('finder_message', 'push_email', 'push_scan'));

-- As in db/qurtag.sql, and the email copy is queued too, due 10 minutes later.
create or replace function qurtag.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update qurtag.threads set last_message_at = new.created_at where id = new.thread_id;
  if new.sender_kind = 'finder' then
    insert into qurtag.outbox (kind, ref) values ('finder_message', new.id);
    insert into qurtag.outbox (kind, ref, next_attempt_at) values ('push_email', new.id, now() + interval '10 minutes');
  end if;
  return new;
end
$$;

-- A scan is queued only when someone who can read the tag's household asked for scan alerts.
-- Due 2 minutes later, so a finder who goes on to write a note is not also told "scanned".
create function qurtag.after_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select from qurtag.tags t
    join qurtag.household_members hm on hm.household_id = t.household_id
    join qurtag.push_settings ps on ps.user_id = hm.user_id and ps.scan_on
    where t.id = new.tag_id
  ) then
    insert into qurtag.outbox (kind, ref, next_attempt_at) values ('push_scan', new.id, now() + interval '2 minutes');
  end if;
  return new;
end
$$;
create trigger scans_after_insert after insert on qurtag.scans
  for each row execute function qurtag.after_scan();

-- 3. The signed-in person's settings (qurtag_user) -----------------------------------------------

create function qurtag.my_push_settings() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return (select json_build_object(
    'found_on', coalesce(s.found_on, true),
    'message_on', coalesce(s.message_on, true),
    'scan_on', coalesce(s.scan_on, false),
    'hide_text', coalesce(s.hide_text, false),
    'email_copy', coalesce(s.email_copy, true))
  from (select 1) one left join qurtag.push_settings s on s.user_id = v_me);
end
$$;

-- Changes only what is given; the rest stays as it was.
create function qurtag.set_push_settings(p_found_on boolean default null, p_message_on boolean default null,
                                         p_scan_on boolean default null, p_hide_text boolean default null,
                                         p_email_copy boolean default null) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into qurtag.push_settings (user_id, found_on, message_on, scan_on, hide_text, email_copy)
  values (v_me, coalesce(p_found_on, true), coalesce(p_message_on, true), coalesce(p_scan_on, false),
          coalesce(p_hide_text, false), coalesce(p_email_copy, true))
  on conflict (user_id) do update set
    found_on = coalesce(p_found_on, qurtag.push_settings.found_on),
    message_on = coalesce(p_message_on, qurtag.push_settings.message_on),
    scan_on = coalesce(p_scan_on, qurtag.push_settings.scan_on),
    hide_text = coalesce(p_hide_text, qurtag.push_settings.hide_text),
    email_copy = coalesce(p_email_copy, qurtag.push_settings.email_copy),
    updated_at = now();
  return qurtag.my_push_settings();
end
$$;

-- 4. Devices (qurtag_server, with the person's verified session) ---------------------------------

create function qurtag.push_session_ok(p_user uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from qurtag.auth_sessions s
                 where s."id" = p_session and s."userId" = p_user and s."expiresAt" > now())
$$;

-- Remembers a token for the person. A token that belonged to someone else on the same phone moves
-- to this person. At most 10 devices per person; the least recently seen go first.
create function qurtag.server_push_register(p_user uuid, p_session uuid, p_token text, p_environment text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_token text := lower(btrim(p_token));
begin
  if not qurtag.push_session_ok(p_user, p_session) then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_token is null or v_token !~ '^[0-9a-f]{32,200}$' or p_environment not in ('sandbox', 'production') then
    raise exception 'bad_token';
  end if;
  insert into qurtag.push_devices (user_id, token, environment) values (p_user, v_token, p_environment)
  on conflict (token) do update set user_id = excluded.user_id, environment = excluded.environment, last_seen_at = now();
  delete from qurtag.push_devices d
  where d.user_id = p_user and d.id in (
    select x.id from qurtag.push_devices x where x.user_id = p_user order by x.last_seen_at desc offset 10);
  return json_build_object('ok', true);
end
$$;

-- Forgets the token on sign out. Only the person's own token goes.
create function qurtag.server_push_unregister(p_user uuid, p_session uuid, p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not qurtag.push_session_ok(p_user, p_session) then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from qurtag.push_devices where user_id = p_user and token = lower(btrim(p_token));
  return json_build_object('ok', true);
end
$$;

-- Apple said the token is gone (the app was removed, or the token is not valid).
create function qurtag.server_push_forget(p_token text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from qurtag.push_devices where token = lower(btrim(p_token));
  get diagnostics n = row_count;
  return n;
end
$$;

-- 5. Who to alert -----------------------------------------------------------------------------------

-- Finder notes the person has not read, across the households they can reach (the app's badge).
create function qurtag.push_unread_for(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from qurtag.messages m
  join qurtag.threads t on t.id = m.thread_id
  where m.sender_kind = 'finder' and m.read_by_owner_at is null
    and t.household_id in (
      select hm.household_id from qurtag.household_members hm
      where hm.user_id = p_user and (hm.role = 'admin' or qurtag.household_plan(hm.household_id) = 'family'))
$$;

-- Everyone who reads the household's inbox, for one finder note, with their own settings and devices.
-- The same people the note email reaches (db/family.sql, section 3).
create function qurtag.server_note_recipients(p_message uuid)
returns table (user_id uuid, email text, item_name text, thread_id uuid, body text, is_first boolean,
               found_on boolean, message_on boolean, hide_text boolean, email_copy boolean,
               unread integer, devices json, handled boolean)
language sql stable security definer set search_path = '' as $$
  select u."id", u."email", i.name, t.id, m.body,
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

-- Records what happened for one person and one note: whether a push went out, and whether the
-- email has been sent. Each flag only ever goes from false to true.
create function qurtag.server_alert_record(p_message uuid, p_user uuid, p_push_sent boolean, p_emailed boolean) returns void
language sql volatile security definer set search_path = '' as $$
  insert into qurtag.note_alerts (message_id, user_id, push_sent, emailed_at)
  select p_message, p_user, p_push_sent, case when p_emailed then now() end
  where exists (select from qurtag.messages m where m.id = p_message)
  on conflict (message_id, user_id) do update set
    push_sent = qurtag.note_alerts.push_sent or excluded.push_sent,
    emailed_at = coalesce(qurtag.note_alerts.emailed_at, excluded.emailed_at)
$$;

-- Who still gets the email copy 10 minutes after a note: they were sent a push, nobody emailed
-- them yet, the note is still unread (and the newest unread one in its conversation), and they
-- have not turned the copy off.
create function qurtag.server_push_email_due(p_message uuid)
returns table (user_id uuid, email text, item_name text)
language sql stable security definer set search_path = '' as $$
  select u."id", u."email", i.name
  from qurtag.note_alerts a
  join qurtag.messages m on m.id = a.message_id
  join qurtag.threads t on t.id = m.thread_id
  join qurtag.items i on i.id = t.item_id
  join qurtag.auth_users u on u."id" = a.user_id
  left join qurtag.push_settings s on s.user_id = u."id"
  where a.message_id = p_message and a.push_sent and a.emailed_at is null
    and m.read_by_owner_at is null
    -- Several notes in a row make one email: the one for the newest unread note.
    and not exists (select from qurtag.messages x
                    where x.thread_id = m.thread_id and x.sender_kind = 'finder' and x.read_by_owner_at is null
                      and (x.created_at, x.id) > (m.created_at, m.id))
    and coalesce(s.email_copy, true)
$$;

-- Who to tell that a tag was scanned: people who asked for it, if no note came from this scan, at
-- most once an hour per tag and person (the claim and the check are one step).
create function qurtag.server_scan_recipients(p_scan uuid)
returns table (user_id uuid, item_name text, hide_text boolean, unread integer, devices json)
language sql volatile security definer set search_path = '' as $$
  with sc as (
    select s.id, s.tag_id, s.scanned_at, t.household_id, i.name as item_name
    from qurtag.scans s
    join qurtag.tags t on t.id = s.tag_id
    join qurtag.items i on i.id = t.current_item_id
    where s.id = p_scan
      and not exists (select from qurtag.threads th where th.tag_id = s.tag_id and th.created_at >= s.scanned_at)
  ),
  cand as (
    select hm.user_id, sc.tag_id, sc.item_name
    from sc
    join qurtag.household_members hm on hm.household_id = sc.household_id
    join qurtag.push_settings ps on ps.user_id = hm.user_id and ps.scan_on
    where hm.role = 'admin' or qurtag.household_plan(sc.household_id) = 'family'
  ),
  claimed as (
    insert into qurtag.push_scan_marks (tag_id, user_id, notified_at)
    select c.tag_id, c.user_id, now() from cand c
    on conflict (tag_id, user_id) do update set notified_at = now()
      where qurtag.push_scan_marks.notified_at < now() - interval '1 hour'
    returning user_id
  )
  select c.user_id, c.item_name, ps.hide_text, qurtag.push_unread_for(c.user_id),
         coalesce((select json_agg(json_build_object('token', d.token, 'environment', d.environment) order by d.last_seen_at desc)
                   from qurtag.push_devices d where d.user_id = c.user_id), '[]'::json)
  from cand c
  join claimed on claimed.user_id = c.user_id
  join qurtag.push_settings ps on ps.user_id = c.user_id
$$;

-- 6. Replying from the notification (qurtag_server, with the person's verified session) ---------------

-- Same rules as owner_reply (a conversation of a household the person can read), for a person the
-- server has verified. Answers the new unread count, which the phone puts on the app icon.
create function qurtag.server_owner_reply(p_user uuid, p_session uuid, p_thread uuid, p_body text) returns json
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
  insert into qurtag.messages (thread_id, sender_kind, body)
  values (p_thread, 'owner', left(btrim(p_body), 2000))
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread and sender_kind = 'finder' and read_by_owner_at is null;
  return json_build_object('message_id', v_id, 'unread', qurtag.push_unread_for(p_user));
end
$$;

-- 7. Rights -------------------------------------------------------------------------------------------

-- A new function can be run by everyone until that is taken away, so take it away from every new
-- function, then give each to the one login that uses it.
revoke all on function
  qurtag.after_scan(), qurtag.push_session_ok(uuid, uuid), qurtag.push_unread_for(uuid),
  qurtag.my_push_settings(), qurtag.set_push_settings(boolean, boolean, boolean, boolean, boolean),
  qurtag.server_push_register(uuid, uuid, text, text), qurtag.server_push_unregister(uuid, uuid, text),
  qurtag.server_push_forget(text), qurtag.server_note_recipients(uuid),
  qurtag.server_alert_record(uuid, uuid, boolean, boolean), qurtag.server_push_email_due(uuid),
  qurtag.server_scan_recipients(uuid), qurtag.server_owner_reply(uuid, uuid, uuid, text)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.push_devices, qurtag.push_settings, qurtag.note_alerts, qurtag.push_scan_marks from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function qurtag.my_push_settings(), qurtag.set_push_settings(boolean, boolean, boolean, boolean, boolean)
  to qurtag_user;
grant execute on function
  qurtag.server_push_register(uuid, uuid, text, text), qurtag.server_push_unregister(uuid, uuid, text),
  qurtag.server_push_forget(text), qurtag.server_note_recipients(uuid),
  qurtag.server_alert_record(uuid, uuid, boolean, boolean), qurtag.server_push_email_due(uuid),
  qurtag.server_scan_recipients(uuid), qurtag.server_owner_reply(uuid, uuid, uuid, text)
  to qurtag_server;

do $$
declare
  bad text;
  t text;
begin
  foreach t in array array['push_devices', 'push_settings', 'note_alerts', 'push_scan_marks'] loop
    select string_agg(r.rolname, ', ') into bad
    from pg_roles r
    where r.rolname like 'qurtag\_%'
      and (has_table_privilege(r.oid, 'qurtag.' || t, 'SELECT') or has_table_privilege(r.oid, 'qurtag.' || t, 'INSERT')
           or has_table_privilege(r.oid, 'qurtag.' || t, 'UPDATE') or has_table_privilege(r.oid, 'qurtag.' || t, 'DELETE'));
    if bad is not null then raise exception 'a role has rights on qurtag.%: %', t, bad; end if;
  end loop;
  if has_function_privilege('qurtag_user', 'qurtag.server_note_recipients(uuid)', 'EXECUTE')
     or has_function_privilege('qurtag_user', 'qurtag.server_push_register(uuid, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.my_push_settings()', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.set_push_settings(boolean, boolean, boolean, boolean, boolean)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
end
$$;

reset check_function_bodies;

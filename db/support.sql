-- QuR Tag: the Contact us form and its queue. Applied after db/qurtag.sql and db/admin.sql
-- (rollout step 3), as `postgres`, in one transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/7-support.sql is this file plus a migration record.
--
-- What it adds
--   qurtag.support_requests  one row per message sent through the Contact us form (Help, and
--                            "Question about a charge?" on the Membership screen): who (the
--                            account and its household when the sender was signed in), the
--                            plan at the time, an email to reply to, a topic (billing, account,
--                            finder, other), the message, open or closed, and when it was
--                            closed. No role the app uses has any right on the table.
--   server_support_create    the only way a row is made. Called by the server route
--                            (/api/fn/support) as `qurtag_server`, which has no table rights.
--                            A signed-in sender's session is checked here and the account id,
--                            plan and email come from the database, never from the form. The
--                            form never asks for card details. Limits: 5 messages an hour per
--                            account or per email address, 100 an hour in all (the route adds
--                            a limit per network address and a hidden honeypot field).
--   admin_support_list / admin_support_close
--                            the Super Admin area lists requests and closes them; both check
--                            for a super admin in the database and write to the admin log.
--   factory_metrics          also answers support_open, support_30d and
--                            support_oldest_open_days, the contract the Company OS support
--                            queue reads (same names as Perklyy).
--
-- Needs rollout step 3 (db/admin.sql): the admin functions and the admin log it extends.
-- The admin log's two allowed lists (actions, target types) gain the new words.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.admin_audit') is null then
    raise exception 'apply db/admin.sql (rollout step 3) first';
  end if;
  if to_regclass('qurtag.support_requests') is not null then
    raise exception 'the contact form is already installed; nothing was changed';
  end if;
end
$$;

create table qurtag.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The sender's account and household when signed in. Deleting the account keeps the message.
  user_id uuid references qurtag.auth_users ("id") on delete set null,
  household_id uuid references qurtag.households (id) on delete set null,
  -- The plan the sender was on when they wrote: free, plus or family. Null when signed out.
  plan text check (plan is null or plan in ('free', 'plus', 'family')),
  reply_email text check (reply_email is null or (length(reply_email) between 3 and 254 and reply_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  topic text not null check (topic in ('billing', 'account', 'finder', 'other')),
  message text not null check (length(btrim(message)) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid,
  check (user_id is not null or reply_email is not null),
  check ((status = 'closed') = (closed_at is not null))
);
create index support_requests_open_idx on qurtag.support_requests (created_at) where status = 'open';
create index support_requests_created_idx on qurtag.support_requests (created_at desc);
alter table qurtag.support_requests enable row level security;

-- The admin log may now name these actions and this kind of target.
alter table qurtag.admin_audit drop constraint admin_audit_action_check;
alter table qurtag.admin_audit add constraint admin_audit_action_check check (action in (
  'view_overview', 'list_accounts', 'view_account',
  'disable_tag', 'enable_tag', 'hide_message', 'unhide_message', 'delete_account',
  'list_support_requests', 'close_support_request'));
alter table qurtag.admin_audit drop constraint admin_audit_target_type_check;
alter table qurtag.admin_audit add constraint admin_audit_target_type_check
  check (target_type in ('account', 'tag', 'message', 'support_request'));

-- 1. Writing a message ------------------------------------------------------------------------

create function qurtag.server_support_create(p_user uuid, p_session uuid, p_email text, p_topic text, p_message text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
  v_household uuid;
  v_plan text;
  v_account_email text;
  v_id uuid;
begin
  if p_topic is null or p_topic not in ('billing', 'account', 'finder', 'other') then raise exception 'bad_topic'; end if;
  if p_message is null or length(btrim(p_message)) = 0 then raise exception 'empty_message'; end if;
  if length(p_message) > 4000 then raise exception 'too_long'; end if;
  if p_user is not null then
    select u."email" into v_account_email
    from qurtag.auth_sessions s join qurtag.auth_users u on u."id" = s."userId"
    where s."id" = p_session and s."userId" = p_user and s."expiresAt" > now();
    if not found then raise exception 'not_authenticated' using errcode = '42501'; end if;
    select h.id into v_household from qurtag.households h where h.owner_user_id = p_user order by h.created_at limit 1;
    v_plan := coalesce(qurtag.household_plan(v_household), 'free');
    v_email := lower(v_account_email);
  elsif v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'bad_email';
  end if;
  if (select count(*) from qurtag.support_requests r
      where r.created_at > now() - interval '1 hour'
        and ((p_user is not null and r.user_id = p_user) or r.reply_email = v_email)) >= 5
     or (select count(*) from qurtag.support_requests r where r.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'too_many';
  end if;
  insert into qurtag.support_requests (user_id, household_id, plan, reply_email, topic, message)
  values (p_user, v_household, v_plan, v_email, p_topic, btrim(p_message))
  returning id into v_id;
  return json_build_object('id', v_id, 'reply_email', v_email, 'plan', v_plan, 'user_id', p_user, 'topic', p_topic);
end
$$;

-- 2. The Super Admin area -----------------------------------------------------------------------

-- Requests, oldest open first. p_status: 'open' (default) or 'closed'. At most 200.
create function qurtag.admin_support_list(p_status text default 'open') returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_status text := coalesce(p_status, 'open');
begin
  if v_status not in ('open', 'closed') then raise exception 'bad_request'; end if;
  perform qurtag.admin_log(v_me, 'list_support_requests', null, null, jsonb_build_object('status', v_status));
  return json_build_object(
    'open', (select count(*) from qurtag.support_requests where status = 'open'),
    'requests', coalesce((
      select json_agg(x) from (
        select r.id, r.created_at, r.topic, r.status, r.plan, r.message, r.reply_email, r.user_id,
               (select u."email" from qurtag.auth_users u where u."id" = r.user_id) as account_email,
               r.closed_at
        from qurtag.support_requests r where r.status = v_status
        order by case when v_status = 'open' then r.created_at end asc, r.created_at desc
        limit 200) x), '[]'::json));
end
$$;

create function qurtag.admin_support_close(p_id uuid) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
begin
  update qurtag.support_requests set status = 'closed', closed_at = now(), closed_by = v_me
  where id = p_id and status = 'open';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform qurtag.admin_log(v_me, 'close_support_request', 'support_request', p_id::text, '{}'::jsonb);
  return json_build_object('id', p_id, 'status', 'closed');
end
$$;

-- 3. The Company OS counts ------------------------------------------------------------------------

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
    -- The support queue: open now, received in 30 days, and the age in whole days of the oldest open one.
    'support_open', (select count(*) from qurtag.support_requests where status = 'open'),
    'support_30d', (select count(*) from qurtag.support_requests where created_at > now() - interval '30 days'),
    'support_oldest_open_days', (select floor(extract(epoch from now() - min(created_at)) / 86400)::int
                                 from qurtag.support_requests where status = 'open')
  );
end
$$;

-- 4. Rights ---------------------------------------------------------------------------------------

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.support_requests from %s', api_role);
      execute format('revoke all on all functions in schema qurtag from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function qurtag.admin_support_list(text), qurtag.admin_support_close(uuid) to qurtag_user;
grant execute on function qurtag.server_support_create(uuid, uuid, text, text, text) to qurtag_server;
grant execute on function qurtag.factory_metrics(text) to qurtag_anon;

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.support_requests', 'SELECT') or has_table_privilege(r.oid, 'qurtag.support_requests', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.support_requests', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.support_requests', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on the support table: %', bad; end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_support_create(uuid, uuid, text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.admin_support_list(text)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
end
$$;

reset check_function_bodies;

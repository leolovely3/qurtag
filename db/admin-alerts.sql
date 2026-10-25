-- QuR Tag: alerts to the Super Admins for new reports (rollout step 9b). Applied after
-- db/moderation.sql (rollout step 9), as `postgres`, in one transaction. It refuses to run twice and
-- refuses to run before step 9. The rollout file ~/Claude/Rollouts/QurTag-rollout-schema/9b-admin-alerts.sql
-- is this file plus a migration record.
--
-- Why it exists: the founder keeps a promise to answer every report within 24 hours, so each new report,
-- and each note the filter holds, queues one outbox row ('admin_alert'). The server sends every super
-- admin who has not turned "Admin alerts" off an iPhone push (no note text) and one email to
-- info@impactconsulting.ai when email is set up. At most one alert goes out per 10 minutes
-- (admin_alert_state); events in between are not dropped: their rows wait until the window ends, and the
-- alert that follows says how many are waiting. If sending fails the window is put back and the row is
-- tried again. push_settings.admin_on is the switch (set_admin_alerts; Settings shows it to super admins
-- only). No role the app uses has any right on admin_alert_state.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.message_reports') is null then
    raise exception 'apply db/moderation.sql (rollout step 9) first';
  end if;
  if to_regclass('qurtag.admin_alert_state') is not null then
    raise exception 'admin alerts are already installed; nothing was changed';
  end if;
end
$$;

-- When the last admin alert went out (one row). The 10 minute window is measured from it.
create table qurtag.admin_alert_state (
  id boolean primary key default true check (id),
  last_sent_at timestamptz
);
insert into qurtag.admin_alert_state (id) values (true);
alter table qurtag.admin_alert_state enable row level security;

-- Each super admin's switch for these alerts. On unless turned off.
alter table qurtag.push_settings add column admin_on boolean not null default true;

-- The outbox may now carry admin alerts.
alter table qurtag.outbox drop constraint outbox_kind_check;
alter table qurtag.outbox add constraint outbox_kind_check
  check (kind in ('finder_message', 'push_email', 'push_scan', 'admin_alert'));

-- Queues one admin alert for a new report or a newly held note, due when the 10 minute window since
-- the last alert has passed (at once when there has been none lately).
create function qurtag.queue_admin_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_last timestamptz;
begin
  select a.last_sent_at into v_last from qurtag.admin_alert_state a;
  insert into qurtag.outbox (kind, ref, next_attempt_at)
  values ('admin_alert', new.id, greatest(now(), coalesce(v_last + interval '10 minutes', now())));
  return new;
end
$$;
create trigger message_reports_alert after insert on qurtag.message_reports
  for each row execute function qurtag.queue_admin_alert();
create trigger messages_held_alert after insert on qurtag.messages
  for each row when (new.held_at is not null) execute function qurtag.queue_admin_alert();

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


-- 5b. Admin alerts -----------------------------------------------------------------------------------

-- Called by the outbox for an admin_alert row (qurtag_server). Starts the 10 minute window and answers
-- who to alert and how many events are waiting (every alert row since the last alert, this one
-- included), or {"waiting": 0} when an alert already went out in the last 10 minutes or this row was
-- already counted by one. 'previous' is what restore_admin_alert puts back if sending fails.
create function qurtag.server_admin_alert_claim() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_prev timestamptz;
  v_n integer;
begin
  select a.last_sent_at into v_prev from qurtag.admin_alert_state a for update;
  if v_prev is not null and v_prev > now() - interval '10 minutes' then
    return json_build_object('waiting', 0);
  end if;
  select count(*) into v_n from qurtag.outbox o
  where o.kind = 'admin_alert' and o.created_at <= now() and (v_prev is null or o.created_at > v_prev);
  if v_n = 0 then return json_build_object('waiting', 0); end if;
  update qurtag.admin_alert_state set last_sent_at = now();
  return json_build_object(
    'waiting', v_n,
    'previous', v_prev,
    'admins', coalesce((
      select json_agg(json_build_object(
        'user_id', a.user_id,
        'unread', qurtag.push_unread_for(a.user_id),
        'devices', coalesce((select json_agg(json_build_object('token', d.token, 'environment', d.environment) order by d.last_seen_at desc)
                             from qurtag.push_devices d where d.user_id = a.user_id), '[]'::json)))
      from qurtag.super_admins a
      left join qurtag.push_settings s on s.user_id = a.user_id
      where coalesce(s.admin_on, true)), '[]'::json));
end
$$;

-- Puts the window back to what it was when sending failed, so the alert is tried again and not lost.
create function qurtag.server_admin_alert_restore(p_previous timestamptz) returns void
language sql volatile security definer set search_path = '' as $$
  update qurtag.admin_alert_state set last_sent_at = p_previous
$$;

-- Settings: a super admin's switch. Answers null for anyone else, so the screen shows nothing.
create function qurtag.my_admin_alerts() returns boolean
language sql stable security definer set search_path = '' as $$
  select case when qurtag.is_super_admin()
              then coalesce((select s.admin_on from qurtag.push_settings s where s.user_id = qurtag.current_account()), true) end
$$;

create function qurtag.set_admin_alerts(p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
begin
  if p_on is null then raise exception 'bad_request'; end if;
  insert into qurtag.push_settings (user_id, admin_on) values (v_me, p_on)
  on conflict (user_id) do update set admin_on = p_on, updated_at = now();
  return p_on;
end
$$;


-- Rights -------------------------------------------------------------------------------------------

revoke all on function
  qurtag.queue_admin_alert(), qurtag.server_admin_alert_claim(), qurtag.server_admin_alert_restore(timestamptz),
  qurtag.my_admin_alerts(), qurtag.set_admin_alerts(boolean)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.admin_alert_state from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function qurtag.my_admin_alerts(), qurtag.set_admin_alerts(boolean) to qurtag_user;
grant execute on function qurtag.server_admin_alert_claim(), qurtag.server_admin_alert_restore(timestamptz) to qurtag_server;

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.admin_alert_state', 'SELECT') or has_table_privilege(r.oid, 'qurtag.admin_alert_state', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.admin_alert_state', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.admin_alert_state', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on the admin alert table: %', bad; end if;
  if exists (select from pg_policies p where p.schemaname = 'qurtag' and p.tablename = 'admin_alert_state') then
    raise exception 'a policy exists on the admin alert table';
  end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_admin_alert_claim()', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.set_admin_alerts(boolean)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.my_admin_alerts()', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
end
$$;

reset check_function_bodies;

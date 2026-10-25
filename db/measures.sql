-- QuR Tag: first-party measures. Applied after db/qurtag.sql, membership.sql, family.sql, admin.sql,
-- support.sql, push.sql and moderation.sql (rollout steps 1 to 9; step 11 gives Free its 3 items), as
-- `postgres`, in one transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/12-measures.sql is this file plus a migration record.
--
-- Why: the founder needs to see what people do, and the Privacy page promises no third-party
-- analytics and no tracking cookies. Every figure here is counted in this database, and the
-- Company OS reads only totals through qurtag.factory_metrics. No row describes one person's
-- behaviour over time: what is kept is the least a total needs.
--
-- What it adds
--   threads.returned_at       when the owner pressed "I have it back" (the conversation became
--                             'reunited'). Set by a trigger, cleared if the status leaves
--                             'reunited'. Conversations already marked are given the time of their
--                             last note, the nearest honest answer. No role the app uses can read it.
--   auth_users.signup_channel the channel a person came from (?ch=<channel>, or utm_source), a short
--                             lowercase label such as "facebook", set once when the account is made
--                             by the sign-in service (server/auth/qurtagAuth.ts) and never changed.
--                             Null when the visit carried none. Only the sign-in login can reach it.
--   tag_print_events          one row each time an owner prints, shares or downloads a tag file:
--                             which household, the style, the look, the paper, the app or the web,
--                             and which button. No item, no tag, no address. Written only by
--                             record_tag_print.
--   app_platforms             which platform an account has signed in from ('ios' or 'web'), first and
--                             last day. Written only by record_app_platform. Existing push devices
--                             are copied in as iPhone accounts, since only the iPhone app can hold one.
--   factory_metrics           also answers: returned_total, returned_30d; accounts_at_free_limit,
--                             accounts_over_free_limit; tags_printed_total, accounts_that_printed,
--                             tags_printed_by_style (and one total per style); scans_with_note_30d,
--                             scans_without_note_30d, scans_no_note_rate_30d; signups_by_channel (7d
--                             and 30d: sign-ups and activated accounts per channel); paid_members
--                             by plan and source (and one total each); iphone_accounts_total,
--                             push_enabled_accounts, push_opt_in_rate.
--
-- "A scan with a note": a scan counts as followed by a note when a conversation was opened on the
-- same tag within one hour after the scan. A scan carries no visitor or session id (by design: no
-- address, no cookie), so this time window is the closest link the data allows. The rate is the
-- share of the last 30 days' scans with no such conversation.
-- "Activated" is the existing meaning: the account has at least one item.
-- "At the free limit": a household on Free whose item count equals the Free limit (household_item_limit,
-- 3 after step 11); "over" has more items than the limit, so some are read-only.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.message_reports') is null then raise exception 'apply db/moderation.sql (rollout step 9) first'; end if;
  if to_regclass('qurtag.push_devices') is null then raise exception 'apply db/push.sql (rollout step 8) first'; end if;
  if to_regprocedure('qurtag.household_item_limit(uuid)') is null then raise exception 'apply db/membership.sql (rollout step 5) first'; end if;
  if to_regclass('qurtag.tag_print_events') is not null then
    raise exception 'the measures are already installed; nothing was changed';
  end if;
end
$$;

-- 1. Returned -----------------------------------------------------------------------------------------

alter table qurtag.threads add column returned_at timestamptz;
update qurtag.threads set returned_at = last_message_at where status = 'reunited';
alter table qurtag.threads add constraint threads_returned_check check ((status = 'reunited') = (returned_at is not null));

create function qurtag.threads_mark_returned() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'reunited' then
    new.returned_at := coalesce(old.returned_at, now());
  else
    new.returned_at := null;
  end if;
  return new;
end
$$;
create trigger threads_mark_returned before update of status on qurtag.threads
  for each row when (old.status is distinct from new.status) execute function qurtag.threads_mark_returned();
create index threads_returned_idx on qurtag.threads (returned_at) where returned_at is not null;

-- 2. Sign-up channel ----------------------------------------------------------------------------------

alter table qurtag.auth_users add column signup_channel text
  check (signup_channel is null or signup_channel ~ '^[a-z0-9][a-z0-9_-]{0,31}$');

-- Set once, when the account is made: nothing can change it afterwards, not even an update the sign-in
-- service is asked to make (its user update takes any field the client names).
create function qurtag.auth_users_keep_channel() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.signup_channel := old.signup_channel;
  return new;
end
$$;
create trigger auth_users_keep_channel before update of signup_channel on qurtag.auth_users
  for each row execute function qurtag.auth_users_keep_channel();

-- 3. Tags printed -------------------------------------------------------------------------------------

create table qurtag.tag_print_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references qurtag.households (id) on delete cascade,
  style text not null check (style in ('sticker', 'strip', 'fob', 'wallet', 'bag', 'clothing')),
  look text not null check (look in ('clean', 'bold', 'playful')),
  paper text not null check (paper in ('letter', 'a4')),
  surface text not null check (surface in ('app', 'web')),
  -- print: pressed Print (web) or Print or share (app); download_pdf: the sheet as a PDF;
  -- download_print_ready_png and download_print_ready_pdf: the file for an online sticker printer.
  action text not null check (action in ('print', 'download_pdf', 'download_print_ready_png', 'download_print_ready_pdf'))
);
create index tag_print_events_household_idx on qurtag.tag_print_events (household_id, created_at desc);
alter table qurtag.tag_print_events enable row level security;

create function qurtag.record_tag_print(p_style text, p_look text, p_paper text, p_surface text, p_action text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_household uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select h.id into v_household from qurtag.households h where h.owner_user_id = v_me order by h.created_at limit 1;
  if v_household is null then return; end if;
  -- A script cannot inflate the figure: 200 events a day per household is far more than a person prints.
  if (select count(*) from qurtag.tag_print_events e
      where e.household_id = v_household and e.created_at > now() - interval '1 day') >= 200 then
    return;
  end if;
  insert into qurtag.tag_print_events (household_id, style, look, paper, surface, action)
  values (v_household, p_style, p_look, p_paper, p_surface, p_action);
end
$$;

-- 4. Platform -----------------------------------------------------------------------------------------

create table qurtag.app_platforms (
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  platform text not null check (platform in ('ios', 'web')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, platform)
);
alter table qurtag.app_platforms enable row level security;

insert into qurtag.app_platforms (user_id, platform, first_seen_at, last_seen_at)
select d.user_id, 'ios', min(d.created_at), max(d.last_seen_at) from qurtag.push_devices d group by d.user_id;

create function qurtag.record_app_platform(p_platform text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_platform is null or p_platform not in ('ios', 'web') then return; end if;
  insert into qurtag.app_platforms (user_id, platform) values (v_me, p_platform)
  on conflict (user_id, platform) do update set last_seen_at = now()
  where qurtag.app_platforms.last_seen_at < now() - interval '1 day';
end
$$;

-- 5. The Company OS counts ----------------------------------------------------------------------------

-- Sign-ups and activated accounts per channel for accounts made in the last p_days days.
create function qurtag.measure_signups_by_channel(p_days integer) returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_object_agg(s.ch, json_build_object('signups', s.n, 'activated', s.a)), '{}'::json)
  from (
    select coalesce(u.signup_channel, 'unknown') as ch, count(*) as n,
           count(*) filter (where exists (select from qurtag.households h join qurtag.items i on i.household_id = h.id
                                          where h.owner_user_id = u."id")) as a
    from qurtag.auth_users u
    where u."createdAt" > now() - make_interval(days => p_days)
    group by 1
  ) s
$$;

-- Scans in the last p_days days followed by a conversation on the same tag within an hour.
create function qurtag.measure_scans_with_note(p_days integer) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from qurtag.scans s
  where s.scanned_at > now() - make_interval(days => p_days)
    and exists (select from qurtag.threads t
                where t.tag_id = s.tag_id and t.created_at >= s.scanned_at and t.created_at < s.scanned_at + interval '1 hour')
$$;

create function qurtag.measure_paid(p_plan text, p_provider text) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from qurtag.subscriptions s where s.plan = p_plan and s.provider = p_provider and qurtag.subscription_counts(s)
$$;

create function qurtag.measure_printed(p_style text) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from qurtag.tag_print_events e where e.style = p_style
$$;

create function qurtag.measure_households_by_limit(p_over boolean) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select qurtag.household_item_limit(h.id) as lim, (select count(*) from qurtag.items i where i.household_id = h.id) as n
    from qurtag.households h where qurtag.household_plan(h.id) = 'free'
  ) x
  where x.lim is not null and case when p_over then x.n > x.lim else x.n = x.lim end
$$;

create or replace function qurtag.factory_metrics(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scans bigint;
  v_with_note bigint;
  v_iphone bigint;
  v_push bigint;
begin
  if p_token is null or not exists (
    select from qurtag.factory_access a
    where a.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into v_scans from qurtag.scans where scanned_at > now() - interval '30 days';
  v_with_note := qurtag.measure_scans_with_note(30);
  select count(*) into v_iphone from (select user_id from qurtag.app_platforms where platform = 'ios'
                                      union select user_id from qurtag.push_devices) x;
  select count(distinct user_id) into v_push from qurtag.push_devices;
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
    'scans_30d', v_scans,
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
                                 from qurtag.message_reports where status = 'open'),
    -- Owners getting things back.
    'returned_total', (select count(*) from qurtag.threads where returned_at is not null),
    'returned_30d', (select count(*) from qurtag.threads where returned_at > now() - interval '30 days'),
    -- Households on Free at the limit, and past it (some items read-only).
    'accounts_at_free_limit', qurtag.measure_households_by_limit(false),
    'accounts_over_free_limit', qurtag.measure_households_by_limit(true),
    -- Tags printed, shared or downloaded: actions, not copies.
    'tags_printed_total', (select count(*) from qurtag.tag_print_events),
    'accounts_that_printed', (select count(distinct household_id) from qurtag.tag_print_events),
    'tags_printed_by_style', json_build_object(
      'sticker', qurtag.measure_printed('sticker'), 'strip', qurtag.measure_printed('strip'),
      'fob', qurtag.measure_printed('fob'), 'wallet', qurtag.measure_printed('wallet'),
      'bag', qurtag.measure_printed('bag'), 'clothing', qurtag.measure_printed('clothing')),
    'tags_printed_sticker', qurtag.measure_printed('sticker'),
    'tags_printed_strip', qurtag.measure_printed('strip'),
    'tags_printed_fob', qurtag.measure_printed('fob'),
    'tags_printed_wallet', qurtag.measure_printed('wallet'),
    'tags_printed_bag', qurtag.measure_printed('bag'),
    'tags_printed_clothing', qurtag.measure_printed('clothing'),
    -- Scan to note.
    'scans_with_note_30d', v_with_note,
    'scans_without_note_30d', v_scans - v_with_note,
    'scans_no_note_rate_30d', case when v_scans > 0 then round((v_scans - v_with_note)::numeric / v_scans, 4) end,
    -- Sign-up source: by channel for accounts made in 7 and in 30 days.
    'signups_by_channel', json_build_object('7d', qurtag.measure_signups_by_channel(7), '30d', qurtag.measure_signups_by_channel(30)),
    -- Paid members now, by plan and where they pay.
    'paid_members_total', qurtag.measure_paid('plus', 'stripe') + qurtag.measure_paid('plus', 'apple')
                          + qurtag.measure_paid('family', 'stripe') + qurtag.measure_paid('family', 'apple'),
    'paid_plus_stripe', qurtag.measure_paid('plus', 'stripe'),
    'paid_plus_apple', qurtag.measure_paid('plus', 'apple'),
    'paid_family_stripe', qurtag.measure_paid('family', 'stripe'),
    'paid_family_apple', qurtag.measure_paid('family', 'apple'),
    -- Alerts on, among iPhone accounts.
    'iphone_accounts_total', v_iphone,
    'push_enabled_accounts', v_push,
    'push_opt_in_rate', case when v_iphone > 0 then round(v_push::numeric / v_iphone, 4) end
  );
end
$$;

-- 6. Rights ---------------------------------------------------------------------------------------------

-- A new function can be run by everyone until that is taken away: take it away from every new function,
-- then give each to the login that uses it. The new tables get no rights and no policy for anyone.
revoke all on function
  qurtag.threads_mark_returned(), qurtag.auth_users_keep_channel(), qurtag.record_tag_print(text, text, text, text, text), qurtag.record_app_platform(text),
  qurtag.measure_signups_by_channel(integer), qurtag.measure_scans_with_note(integer), qurtag.measure_paid(text, text),
  qurtag.measure_printed(text), qurtag.measure_households_by_limit(boolean)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.tag_print_events, qurtag.app_platforms from %s', api_role);
      if api_role <> 'public' then
        execute format('revoke all on function qurtag.threads_mark_returned(), qurtag.auth_users_keep_channel(), qurtag.record_tag_print(text, text, text, text, text), qurtag.record_app_platform(text), qurtag.measure_signups_by_channel(integer), qurtag.measure_scans_with_note(integer), qurtag.measure_paid(text, text), qurtag.measure_printed(text), qurtag.measure_households_by_limit(boolean) from %s', api_role);
      end if;
    end if;
  end loop;
end
$$;

grant execute on function qurtag.record_tag_print(text, text, text, text, text), qurtag.record_app_platform(text) to qurtag_user;

-- 7. Checks before finishing ---------------------------------------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.tag_print_events', 'SELECT') or has_table_privilege(r.oid, 'qurtag.tag_print_events', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.tag_print_events', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.tag_print_events', 'DELETE')
         or has_table_privilege(r.oid, 'qurtag.app_platforms', 'SELECT') or has_table_privilege(r.oid, 'qurtag.app_platforms', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.app_platforms', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.app_platforms', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on a new table: %', bad; end if;
  if has_column_privilege('qurtag_user', 'qurtag.threads', 'returned_at', 'SELECT')
     or has_column_privilege('qurtag_user', 'qurtag.threads', 'returned_at', 'UPDATE') then
    raise exception 'the owner role can reach threads.returned_at';
  end if;
  if exists (select from information_schema.role_table_grants g
             where g.table_schema = 'qurtag' and g.table_name = 'auth_users' and g.grantee in ('qurtag_user', 'qurtag_anon', 'qurtag_server')) then
    raise exception 'a request role can reach the sign-in tables';
  end if;
  if has_function_privilege('qurtag_anon', 'qurtag.record_tag_print(text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.record_app_platform(text)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.record_tag_print(text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_user', 'qurtag.measure_paid(text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.measure_signups_by_channel(integer)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
  if not has_function_privilege('qurtag_anon', 'qurtag.factory_metrics(text)', 'EXECUTE') then
    raise exception 'the Factory lost the right to call factory_metrics';
  end if;
end
$$;

reset check_function_bodies;

-- Mirror of db/page-views.sql, here so a scanner that reads supabase/migrations sees the function. These files are
-- not applied to production (QuR Tag's schema is built by the rollout in ~/Claude/Rollouts/QurTag-rollout-schema from db/).
-- QuR Tag: anonymous page views, counted per UTC day, page route and source (rollout step 18).
-- Needs db/measures.sql (rollout step 12), whose qurtag.factory_metrics this replaces. As `postgres`, in one
-- transaction. It refuses to run twice. The rollout file ~/Claude/Rollouts/QurTag-rollout-schema/18-page-views.sql
-- is this file plus a migration record. Undo: db/undo-page-views.sql.
--
-- The same counter ForgeHOA, FaithHaven, PokerPulse and PaidUp keep (PokerPulse
-- supabase/migrations/20261104120000_site_visits.sql), in schema qurtag behind QuR Tag's own data API.
--
-- qurtag.site_visits holds one row per UTC day, page route and source, and a number:
--   day     the UTC day, set by the database, never by the browser;
--   path    the route pattern (/find/:id, never a tag code), no query, no hash; a CHECK allows letters, digits,
--           / : _ and -, up to 100;
--   source  direct, search, ai, social or referral (the browser reduces the referring site to its kind and never
--           sends its host), or the link's own utm_source or src tag, [a-z0-9-]{1,40};
--   visits  how many page loads were counted.
-- No user id, no IP, no cookie, no device id, no time of day.
--
-- qurtag.record_visit(p_path, p_source) is the only way in. The data API's rpc route calls it with no pass (as
-- qurtag_anon); it adds one to a counter and returns nothing. A bad path or source is ignored without an error, and
-- at most 5000 different (path, source) pairs are kept a day, so a script inventing paths cannot grow the table.
--
-- Reads: row security is on with no policy and no login holds a right on the table, so nobody reads it through the
-- API. The Company OS reads totals only, through qurtag.factory_metrics, which answers one more key, "visits":
-- last_7_days, last_30_days, by_source_30_days (top 50), by_path_30_days and by_path_7_days (top 200 each) and the
-- last 30 UTC days (a day with no visits is left out). Every other key it answered is unchanged: the function below
-- is the one in db/measures.sql with that key added.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.tag_print_events') is null then raise exception 'apply db/measures.sql (rollout step 12) first'; end if;
  if to_regclass('qurtag.site_visits') is not null then
    raise exception 'the page view counter is already installed; nothing was changed';
  end if;
end
$$;

create table qurtag.site_visits (
  "day" date not null,
  path text not null check (char_length(path) between 1 and 100 and path ~ '^/[A-Za-z0-9/:_-]*$'),
  source text not null check (source ~ '^[a-z0-9-]{1,40}$'),
  visits integer not null default 0 check (visits >= 0),
  primary key ("day", path, source)
);
comment on table qurtag.site_visits is
  'Anonymous page view counts: one row per UTC day, page route and source, holding a number and nothing about any person. Written only by qurtag.record_visit.';
alter table qurtag.site_visits enable row level security;

create function qurtag.record_visit(p_path text, p_source text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_path is null or char_length(p_path) not between 1 and 100 or p_path !~ '^/[A-Za-z0-9/:_-]*$' then
    return;
  end if;
  if p_source is null or p_source !~ '^[a-z0-9-]{1,40}$' then
    return;
  end if;
  -- At most 5000 different (path, source) pairs a day: a script inventing paths cannot grow the table
  -- without bound. Existing pairs still count.
  if not exists (select 1 from qurtag.site_visits v where v."day" = v_day and v.path = p_path and v.source = p_source)
     and (select count(*) from qurtag.site_visits v where v."day" = v_day) >= 5000 then
    return;
  end if;
  insert into qurtag.site_visits as v ("day", path, source, visits)
  values (v_day, p_path, p_source, 1)
  on conflict ("day", path, source) do update set visits = v.visits + 1;
end
$$;

-- The Company OS's counts: the function of db/measures.sql with the "visits" key added.
create or replace function qurtag.factory_metrics(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scans bigint;
  v_with_note bigint;
  v_iphone bigint;
  v_push bigint;
  v_today date := (now() at time zone 'utc')::date;
  v_visits json;
begin
  if p_token is null or not exists (
    select from qurtag.factory_access a
    where a.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Anonymous page views (qurtag.site_visits): totals by UTC day, route and source, never a person.
  with d as (
    select v."day", v.path, v.source, v.visits from qurtag.site_visits v where v."day" >= v_today - 29
  )
  select json_build_object(
    'last_7_days', coalesce((select sum(d.visits) from d where d."day" >= v_today - 6), 0),
    'last_30_days', coalesce((select sum(d.visits) from d), 0),
    'by_source_30_days', coalesce((select json_object_agg(s.source, s.n) from (
        select d.source, sum(d.visits)::bigint as n from d group by d.source order by n desc, d.source limit 50) s), '{}'::json),
    'by_path_30_days', coalesce((select json_object_agg(s.path, s.n) from (
        select d.path, sum(d.visits)::bigint as n from d group by d.path order by n desc, d.path limit 200) s), '{}'::json),
    'by_path_7_days', coalesce((select json_object_agg(s.path, s.n) from (
        select d.path, sum(d.visits)::bigint as n from d where d."day" >= v_today - 6 group by d.path order by n desc, d.path limit 200) s), '{}'::json),
    'days', coalesce((select json_agg(json_build_object('day', s."day", 'visits', s.n) order by s."day") from (
        select d."day", sum(d.visits)::bigint as n from d group by d."day") s), '[]'::json)
  ) into v_visits;
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
    'push_opt_in_rate', case when v_iphone > 0 then round(v_push::numeric / v_iphone, 4) end,
    -- Anonymous page views, as totals.
    'visits', v_visits
  );
end
$$;

-- Rights: nobody has any on the table; only the visitor login the data API uses with no pass may count a visit.
revoke all on function qurtag.record_visit(text, text) from public;
do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.site_visits from %s', api_role);
      if api_role <> 'public' then
        execute format('revoke all on function qurtag.record_visit(text, text) from %s', api_role);
      end if;
    end if;
  end loop;
end
$$;
grant execute on function qurtag.record_visit(text, text) to qurtag_anon;

-- Checks before finishing.
do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.site_visits', 'SELECT') or has_table_privilege(r.oid, 'qurtag.site_visits', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.site_visits', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.site_visits', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on qurtag.site_visits: %', bad; end if;
  if not has_function_privilege('qurtag_anon', 'qurtag.record_visit(text, text)', 'EXECUTE') then
    raise exception 'a visitor cannot count a page view';
  end if;
  if has_function_privilege('qurtag_user', 'qurtag.record_visit(text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.record_visit(text, text)', 'EXECUTE') then
    raise exception 'a role can call record_visit that must not';
  end if;
  if not has_function_privilege('qurtag_anon', 'qurtag.factory_metrics(text)', 'EXECUTE') then
    raise exception 'the Factory lost the right to call factory_metrics';
  end if;
end
$$;

reset check_function_bodies;

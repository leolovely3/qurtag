-- Mirror of db/factory-signup-sources.sql, here so a scanner that reads supabase/migrations sees the function. These files are
-- not applied to production (QuR Tag's schema is built by the rollout in ~/Claude/Rollouts/QurTag-rollout-schema from db/).
-- QuR Tag: the Company OS's read of where each new account came from. Applied after db/signup-source.sql (rollout
-- step 16) as `postgres`, in one transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/17-signup-source-reader.sql is this file plus a migration record.
-- Undo: db/undo-factory-signup-sources.sql.
--
-- qurtag.factory_signup_sources(p_token, p_days): the same guard as qurtag.factory_metrics (only a token whose
-- SHA-256 is in qurtag.factory_access is answered; anyone else gets 42501) and the same way in (the data API's
-- rpc route with no pass, execute for qurtag_anon). It reads qurtag.signup_sources, which no role can read, and
-- answers one row per account made in the last p_days days (1 to 90, default 28):
--   day            the day the sign-up was recorded (UTC date)
--   utm_source     the link's source tag, or null
--   utm_content    the post tag the Company OS puts on every post link, or null
--   referrer_host  the host of the referring page (no path, no query, no www), or null
--   channel        the channel worked out in the app (the word stored with the row)
--   ours           true when the account is ours, by the account's own address: a reserved test or example
--                  domain, impactconsulting.ai or qurtag.com, or a test name. The rule is the Company OS's
--                  (internal-accounts.ts) as far as a product can apply it alone: it cannot know the other
--                  products' addresses or the founder's file of friends, so the report may count a few of
--                  ours as customers, never the other way round.
-- Nothing else leaves: no name, no email, no account id, no landing path. At most 5000 rows, newest first;
-- `truncated` says when there were more. Nothing is written.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.signup_sources') is null then raise exception 'apply db/signup-source.sql (rollout step 16) first'; end if;
  if to_regprocedure('qurtag.factory_signup_sources(text, integer)') is not null then
    raise exception 'the sign-up source reader is already installed; nothing was changed';
  end if;
end
$$;

create function qurtag.factory_signup_sources(p_token text, p_days integer default 28) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 28), 1), 90);
  v_out json;
begin
  if p_token is null or not exists (
    select from qurtag.factory_access a
    where a.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  with shaped as (
    select s.recorded_at,
           nullif(btrim(s.utm_source), '') as utm_source,
           nullif(btrim(s.utm_content), '') as utm_content,
           nullif(lower(regexp_replace(coalesce(substring(s.referrer_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#:]+)'), substring(s.referrer_url from '^([^/?#:]+)')), '^www\.', '')), '') as referrer_host,
           s.acquisition_channel as channel,
           lower(coalesce(u."email", '')) as email
      from qurtag.signup_sources s
      join qurtag.auth_users u on u."id" = s.user_id
     where s.recorded_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc') - ((v_days - 1) * interval '1 day')
  ), answer as (
    select x.recorded_at, x.utm_source, x.utm_content, x.referrer_host, x.channel,
           (x.dom ~ '\.(test|demo|example|invalid|localhost)$'
            or x.dom in ('example.com', 'example.org', 'example.net', 'impactconsulting.ai', 'qurtag.com')
            or x.dom like '%.impactconsulting.ai'
            or x.dom like '%.qurtag.com'
            or x.local_part ~* '^(test|tester|testing|qa|demo|sandbox|reviewer|review)[0-9._+-]*$'
            or x.local_part ~* '\+(test|qa|demo)') as ours
      from (select shaped.*, split_part(email, '@', 1) as local_part, split_part(email, '@', 2) as dom from shaped) x
  )
  select json_build_object(
           'read_at', now(),
           'days', v_days,
           'truncated', (select count(*) from answer) > 5000,
           'rows', coalesce((select json_agg(json_build_object(
                      'day', (r.recorded_at at time zone 'utc')::date, 'utm_source', r.utm_source, 'utm_content', r.utm_content,
                      'referrer_host', r.referrer_host, 'channel', r.channel, 'ours', r.ours) order by r.recorded_at desc)
                    from (select * from answer order by recorded_at desc limit 5000) r), '[]'::json))
    into v_out;
  return v_out;
end
$$;

-- Rights: only the visitor login the data API uses with no pass (the Factory sends its token, not a pass).
revoke all on function qurtag.factory_signup_sources(text, integer) from public;
do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    if exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on function qurtag.factory_signup_sources(text, integer) from %s', api_role);
    end if;
  end loop;
end
$$;
grant execute on function qurtag.factory_signup_sources(text, integer) to qurtag_anon;

-- Checks before finishing.
do $$
begin
  if not has_function_privilege('qurtag_anon', 'qurtag.factory_signup_sources(text, integer)', 'EXECUTE') then
    raise exception 'the Factory cannot call factory_signup_sources';
  end if;
  if has_function_privilege('qurtag_user', 'qurtag.factory_signup_sources(text, integer)', 'EXECUTE') and not has_function_privilege('qurtag_anon', 'qurtag.factory_signup_sources(text, integer)', 'EXECUTE') then
    raise exception 'only an owner can call factory_signup_sources';
  end if;
  if exists (select from pg_roles r where r.rolname like 'qurtag\_%' and has_table_privilege(r.oid, 'qurtag.signup_sources', 'SELECT')) then
    raise exception 'a role can read qurtag.signup_sources directly';
  end if;
end
$$;

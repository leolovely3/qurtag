-- QuR Tag: where a new account came from. Applied after db/measures.sql (rollout step 12; step 14 keeps the
-- channel) as `postgres`, in one transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/16-signup-source.sql is this file plus a migration record.
-- Undo: db/undo-signup-source.sql.
--
-- Why: auth_users.signup_channel holds one short label (?ch=, else utm_source). The company needs the rest of
-- what the first page of the visit carried, and the channel worked out from it, to say which post, link or
-- search brought an account. Nothing else is kept: no name, no email, no IP, no device id.
--
-- qurtag.signup_sources: one row per account.
--   utm_source, utm_medium, utm_campaign, utm_term, utm_content   the link's own tags (up to 100 characters)
--   referrer_url          the referring page without its query or hash (up to 512)
--   landing_path          the first page's path, plain words only (checked); a tag's page is /find/:id, never its code
--   acquisition_channel   one of the words in the check, worked out in the app from the tags and the referrer
-- It goes with the account (on delete cascade). Row security is on and no role the app uses has a right on it:
-- the person cannot read it back, no other person can read it, and only the owner login of the database
-- (and so the Company OS, through a function of its own when it asks) reads it.
--
-- qurtag.record_signup_source(the eight values as text): the only way in, for a signed-in owner (qurtag_user). It writes
-- the caller's own row, once: the first touch is never overwritten, a second call changes nothing, an unknown
-- channel is refused, a landing path that is not a plain path is dropped, and an account made more than
-- 7 days ago is refused (the answer is false), so a sign-in a year later never writes a source.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.tag_print_events') is null then raise exception 'apply db/measures.sql (rollout step 12) first'; end if;
  if to_regclass('qurtag.signup_sources') is not null then
    raise exception 'the sign-up source is already installed; nothing was changed';
  end if;
end
$$;

create table qurtag.signup_sources (
  user_id uuid primary key references qurtag.auth_users ("id") on delete cascade,
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  utm_term text check (char_length(utm_term) <= 100),
  utm_content text check (char_length(utm_content) <= 100),
  referrer_url text check (char_length(referrer_url) <= 512),
  landing_path text check (char_length(landing_path) <= 100 and landing_path ~ '^/[A-Za-z0-9/:_-]*$'),
  acquisition_channel text not null check (acquisition_channel in
    ('paid_search', 'organic_search', 'paid_social', 'organic_social', 'email', 'partner', 'ai', 'referral', 'direct')),
  recorded_at timestamptz not null default now()
);
alter table qurtag.signup_sources enable row level security;

create function qurtag.record_signup_source(
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_term text, p_utm_content text,
  p_referrer_url text, p_landing_path text, p_channel text
) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_channel text;
  v_path text;
  v_rows integer;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_channel := nullif(btrim(p_channel), '');
  if v_channel is null or v_channel not in
     ('paid_search', 'organic_search', 'paid_social', 'organic_social', 'email', 'partner', 'ai', 'referral', 'direct') then
    return false;
  end if;
  if not exists (select from qurtag.auth_users u where u."id" = v_me and u."createdAt" > now() - interval '7 days') then
    return false;
  end if;
  v_path := p_landing_path;
  if v_path is null or char_length(v_path) > 100 or v_path !~ '^/[A-Za-z0-9/:_-]*$' then v_path := null; end if;

  insert into qurtag.signup_sources
    (user_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer_url, landing_path, acquisition_channel)
  values (
    v_me,
    left(nullif(btrim(p_utm_source), ''), 100),
    left(nullif(btrim(p_utm_medium), ''), 100),
    left(nullif(btrim(p_utm_campaign), ''), 100),
    left(nullif(btrim(p_utm_term), ''), 100),
    left(nullif(btrim(p_utm_content), ''), 100),
    left(nullif(btrim(p_referrer_url), ''), 512),
    v_path,
    v_channel
  )
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

-- Rights: nobody has any on the table; the function is for signed-in owners only.
revoke all on function qurtag.record_signup_source(text, text, text, text, text, text, text, text) from public;
do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.signup_sources from %s', api_role);
      if api_role <> 'public' then
        execute format('revoke all on function qurtag.record_signup_source(text, text, text, text, text, text, text, text) from %s', api_role);
      end if;
    end if;
  end loop;
end
$$;
grant execute on function qurtag.record_signup_source(text, text, text, text, text, text, text, text) to qurtag_user;

-- Checks before finishing.
do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.signup_sources', 'SELECT') or has_table_privilege(r.oid, 'qurtag.signup_sources', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.signup_sources', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.signup_sources', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on qurtag.signup_sources: %', bad; end if;
  if has_function_privilege('qurtag_anon', 'qurtag.record_signup_source(text, text, text, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'a visitor can call record_signup_source';
  end if;
  if not has_function_privilege('qurtag_user', 'qurtag.record_signup_source(text, text, text, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'an owner cannot call record_signup_source';
  end if;
end
$$;

-- The three database logins QuR Tag uses, after db/qurtag.sql.
--
--   qurtag_auth           the sign-in service (Vercel: QURTAG_DATABASE_URL)
--   qurtag_authenticator  the data API (Vercel: QURTAG_DATABASE_URL_DATA). It may
--                            become qurtag_user or qurtag_anon and nothing else;
--                            it has no rights of its own. A pass naming any other role
--                            fails at the database ("permission denied to set role").
--   qurtag_server         the server routes (Vercel: QURTAG_DATABASE_URL_SERVER)
--
-- Passwords are never in this file. Each comes from a setting made in the same session
-- (qurtag.auth_password, qurtag.authenticator_password, qurtag.server_password),
-- best as a SCRAM-SHA-256 verifier so the password itself never reaches the server.
-- A login whose setting is empty keeps its current password. The Factory's metrics
-- token arrives the same way, as its SHA-256 (qurtag.factory_token_sha256).
--
-- It also takes the two request roles away from every other role (Supabase's own
-- `authenticator` included), so only QuR Tag' data API can act as a QuR Tag person,
-- and checks the result before finishing. Safe to run more than once.

do $$
declare
  pw_auth text := nullif(current_setting('qurtag.auth_password', true), '');
  pw_data text := nullif(current_setting('qurtag.authenticator_password', true), '');
  pw_server text := nullif(current_setting('qurtag.server_password', true), '');
  token_hash text := nullif(current_setting('qurtag.factory_token_sha256', true), '');
  m record;
  request_roles constant text[] := array['qurtag_user', 'qurtag_anon'];
  all_roles constant text[] := array['qurtag_user', 'qurtag_anon', 'qurtag_auth',
                                     'qurtag_authenticator', 'qurtag_server'];
  r text;
begin
  if to_regnamespace('qurtag') is null then
    raise exception 'apply db/qurtag.sql first';
  end if;
  foreach r in array all_roles loop
    if not exists (select from pg_roles where rolname = r) then
      raise exception 'role % is missing: apply db/qurtag.sql first', r;
    end if;
  end loop;

  -- 1. Attributes ------------------------------------------------------------------
  alter role qurtag_auth with login noinherit connection limit 15;
  alter role qurtag_authenticator with login noinherit connection limit 20;
  alter role qurtag_server with login noinherit connection limit 15;
  alter role qurtag_user with nologin noinherit;
  alter role qurtag_anon with nologin noinherit;
  if exists (select from pg_roles where rolname = any (all_roles)
             and (rolsuper or rolreplication or rolbypassrls or rolcreatedb or rolcreaterole)) then
    raise exception 'a QuR Tag role has a power it must not have';
  end if;
  if pw_auth is not null then execute format('alter role qurtag_auth with password %L', pw_auth); end if;
  if pw_data is not null then execute format('alter role qurtag_authenticator with password %L', pw_data); end if;
  if pw_server is not null then execute format('alter role qurtag_server with password %L', pw_server); end if;

  -- Every statement stops on its own; the data API also sets a limit per request,
  -- since a role's own setting does not apply after SET ROLE.
  alter role qurtag_auth set statement_timeout = '10s';
  alter role qurtag_authenticator set statement_timeout = '10s';
  alter role qurtag_server set statement_timeout = '25s';
  alter role qurtag_auth set search_path = '';
  alter role qurtag_server set search_path = '';
  alter role qurtag_user set statement_timeout = '8s';
  alter role qurtag_anon set statement_timeout = '3s';

  -- 2. Memberships: only the data API login may become the two request roles --------
  for m in
    select g.rolname as granted, r2.rolname as member, gr.rolname as grantor
    from pg_auth_members am
    join pg_roles g on g.oid = am.roleid
    join pg_roles r2 on r2.oid = am.member
    join pg_roles gr on gr.oid = am.grantor
    where r2.rolname = any (all_roles)
      and not (r2.rolname = 'qurtag_authenticator' and g.rolname = any (request_roles))
  loop
    execute format('revoke %I from %I granted by %I', m.granted, m.member, m.grantor);
  end loop;
  -- Kept: grants that carry neither INHERIT nor SET (Postgres 16 and later give the
  -- creator of a role an admin-only membership).
  for m in
    select g.rolname as granted, r2.rolname as member, gr.rolname as grantor
    from pg_auth_members am
    join pg_roles g on g.oid = am.roleid
    join pg_roles r2 on r2.oid = am.member
    join pg_roles gr on gr.oid = am.grantor
    where g.rolname = any (all_roles)
      and not (r2.rolname = 'qurtag_authenticator' and g.rolname = any (request_roles))
      and (coalesce((to_jsonb(am) ->> 'set_option')::boolean, true)
           or coalesce((to_jsonb(am) ->> 'inherit_option')::boolean, true))
  loop
    execute format('revoke %I from %I granted by %I', m.granted, m.member, m.grantor);
  end loop;
  if current_setting('server_version_num')::int >= 160000 then
    execute 'grant qurtag_user, qurtag_anon to qurtag_authenticator with inherit false, set true';
  else
    execute 'grant qurtag_user, qurtag_anon to qurtag_authenticator';
  end if;

  -- 3. Connect rights; the data API login has nothing else -------------------------
  execute format('grant connect on database %I to qurtag_auth, qurtag_authenticator, qurtag_server',
                 current_database());
  revoke all on schema qurtag from qurtag_authenticator;
  revoke all on all tables in schema qurtag from qurtag_authenticator;
  revoke all on all sequences in schema qurtag from qurtag_authenticator;
  revoke all on all functions in schema qurtag from qurtag_authenticator;

  -- 4. The Factory's metrics token (its SHA-256 only) --------------------------------
  if token_hash is not null then
    insert into qurtag.factory_access (token_sha256) values (lower(token_hash)) on conflict do nothing;
  end if;

  -- 5. Checks ------------------------------------------------------------------------
  -- The data API login can become the two request roles and nothing else.
  if exists (select from pg_roles x
             where x.rolname not in ('qurtag_authenticator', 'qurtag_user', 'qurtag_anon')
               and pg_has_role('qurtag_authenticator', x.oid, 'MEMBER')) then
    raise exception 'qurtag_authenticator can still become another role';
  end if;
  -- No other QuR Tag role can become any role.
  if exists (select from pg_auth_members am
             join pg_roles r2 on r2.oid = am.member
             where r2.rolname = any (all_roles) and r2.rolname <> 'qurtag_authenticator') then
    raise exception 'a QuR Tag role other than qurtag_authenticator is a member of another role';
  end if;
  -- No role but the data API login (and superusers) can act as a QuR Tag role.
  foreach r in array all_roles loop
    if exists (
      select from pg_roles x
      where x.rolname <> r and not x.rolsuper
        and not (x.rolname = 'qurtag_authenticator' and r = any (request_roles))
        and (pg_has_role(x.oid, r, 'USAGE')
             or pg_has_role(x.oid, r, case when current_setting('server_version_num')::int >= 160000
                                           then 'SET' else 'MEMBER' end))
    ) then
      raise exception 'another role can act as %', r;
    end if;
  end loop;
end
$$;

reset qurtag.auth_password;
reset qurtag.authenticator_password;
reset qurtag.server_password;
reset qurtag.factory_token_sha256;

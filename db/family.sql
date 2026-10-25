-- QuR Tag: the Family household. Applied after db/membership.sql, as `postgres`, in one
-- transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/6-family.sql is this file plus a migration record.
--
-- How a family works
--   A Family plan belongs to the buyer's own household. The owner invites up to 4 other
--   people by email (5 people in all). Someone who accepts becomes a member of that
--   household: they see and edit its items, tags, conversations and scans, because every
--   rule already says "rows of a household I belong to" (qurtag.my_household_ids). Items a
--   member adds go into the family's household and stay there if they leave. A member's own
--   account and its own household (and anything in it) are untouched: the member keeps
--   seeing their own items too, and the owner of the family never sees them.
--
--   Never one household's data to another: a person reaches a household only through a
--   row in household_members, and that row exists only for the owner, or for a member who
--   accepted an invite (accept_invite) made out to their own email address.
--
-- An invite
--   household_invites keeps only the SHA-256 of the link's token, so a database reader
--   cannot use an invite. The server makes the token (server_create_invite is called by the
--   invite route after it checks the owner's pass) and the owner gets the link once, to
--   copy or to email. An invite lasts 7 days, is for one email address (accepting needs an
--   account with that email), works once, and can be revoked. Pending invites hold a seat.
--
-- When the plan stops being Family
--   Members stay recorded but lose access (my_household_ids counts a membership only while
--   the household's plan is Family, or for its owner), so nothing is deleted; they get
--   access back if the owner subscribes again. The owner's own items follow the new plan
--   (read-only past the limit, see db/membership.sql).
--
-- Leaving and removing
--   A member can leave (leave_household); the owner can remove any member (remove_member).
--   Either way the person's access ends at once.
--
-- It also lets the owner's finder-note email reach every active member of the household.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.subscriptions') is null then
    raise exception 'apply db/membership.sql first';
  end if;
  if to_regclass('qurtag.household_invites') is not null then
    raise exception 'the family household is already installed; nothing was changed';
  end if;
end
$$;

create table qurtag.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references qurtag.households (id) on delete cascade,
  email text not null check (length(email) between 3 and 254 and email = lower(email)),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references qurtag.auth_users ("id") on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references qurtag.auth_users ("id") on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index household_invites_household_idx on qurtag.household_invites (household_id);
alter table qurtag.household_invites enable row level security;

-- 1. Who belongs to which household -----------------------------------------------------------

-- Every household the signed-in person can reach: their own, and the Family households
-- they joined while those are on the Family plan.
create or replace function qurtag.my_household_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.household_id from qurtag.household_members m
  where m.user_id = qurtag.current_account()
    and (m.role = 'admin' or qurtag.household_plan(m.household_id) = 'family')
$$;

-- The household new items go into: the family the person joined (while it is on the Family
-- plan), else their own.
create or replace function qurtag.primary_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.household_id from qurtag.household_members m
     where m.user_id = qurtag.current_account() and m.role = 'member'
       and qurtag.household_plan(m.household_id) = 'family'
     order by m.created_at limit 1),
    (select m.household_id from qurtag.household_members m
     where m.user_id = qurtag.current_account() and m.role = 'admin'
     order by m.created_at limit 1))
$$;

-- 2. Invites -------------------------------------------------------------------------------------

-- Called by the invite route with the owner's verified pass. The token is made by the server.
create function qurtag.server_create_invite(p_user uuid, p_session uuid, p_email text, p_token text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_household uuid;
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if not exists (select from qurtag.auth_sessions s where s."id" = p_session and s."userId" = p_user and s."expiresAt" > now()) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select h.id into v_household from qurtag.households h where h.owner_user_id = p_user order by h.created_at limit 1 for update;
  if v_household is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if qurtag.household_plan(v_household) <> 'family' then raise exception 'family_required'; end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email';
  end if;
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'bad_token'; end if;
  if exists (select from qurtag.auth_users u where u."id" = p_user and lower(u."email") = v_email) then
    raise exception 'invite_self';
  end if;
  if exists (select from qurtag.household_members m join qurtag.auth_users u on u."id" = m.user_id
             where m.household_id = v_household and lower(u."email") = v_email) then
    raise exception 'already_member';
  end if;
  -- A newer invite to the same address replaces the older one.
  update qurtag.household_invites i set revoked_at = now()
  where i.household_id = v_household and i.email = v_email and i.accepted_at is null and i.revoked_at is null;
  if (select count(*) from qurtag.household_members m where m.household_id = v_household and m.role = 'member')
     + (select count(*) from qurtag.household_invites i
        where i.household_id = v_household and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) >= 4 then
    raise exception 'family_full';
  end if;
  insert into qurtag.household_invites (household_id, email, token_sha256, created_by, expires_at)
  values (v_household, v_email, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), p_user, v_expires)
  returning id into v_id;
  return json_build_object('invite_id', v_id, 'expires_at', v_expires, 'email', v_email);
end
$$;

-- What the invite page shows before the person accepts. Only someone signed in, and only
-- with the link's token.
create function qurtag.invite_preview(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_my_email text;
  v_inv qurtag.household_invites;
  v_inviter text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_token is null or length(p_token) not between 32 and 128 then return json_build_object('valid', false, 'reason', 'invalid'); end if;
  select * into v_inv from qurtag.household_invites i where i.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_inv.id is null then return json_build_object('valid', false, 'reason', 'invalid'); end if;
  if v_inv.revoked_at is not null then return json_build_object('valid', false, 'reason', 'revoked'); end if;
  if v_inv.accepted_at is not null then return json_build_object('valid', false, 'reason', 'used'); end if;
  if v_inv.expires_at <= now() then return json_build_object('valid', false, 'reason', 'expired'); end if;
  select lower(u."email") into v_my_email from qurtag.auth_users u where u."id" = v_me;
  select coalesce(nullif(btrim(u."name"), ''), regexp_replace(u."email", '^(.).*(@.*)$', '\1***\2')) into v_inviter
  from qurtag.auth_users u where u."id" = v_inv.created_by;
  return json_build_object(
    'valid', true,
    'inviter', v_inviter,
    'email_matches', v_my_email = v_inv.email,
    'invited_email_hint', regexp_replace(v_inv.email, '^(.).*(@.*)$', '\1***\2'),
    'family_active', qurtag.household_plan(v_inv.household_id) = 'family'
  );
end
$$;

create function qurtag.accept_invite(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_my_email text;
  v_inv qurtag.household_invites;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'invite_invalid'; end if;
  select * into v_inv from qurtag.household_invites i
  where i.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception 'invite_invalid';
  end if;
  select lower(u."email") into v_my_email from qurtag.auth_users u where u."id" = v_me;
  if v_my_email is distinct from v_inv.email then raise exception 'invite_wrong_email'; end if;
  perform 1 from qurtag.households h where h.id = v_inv.household_id for update;
  if exists (select from qurtag.households h where h.id = v_inv.household_id and h.owner_user_id = v_me) then
    raise exception 'invite_self';
  end if;
  if qurtag.household_plan(v_inv.household_id) <> 'family' then raise exception 'family_inactive'; end if;
  if (select count(*) from qurtag.household_members m where m.household_id = v_inv.household_id and m.role = 'member') >= 4 then
    raise exception 'family_full';
  end if;
  -- Someone whose own household has members cannot join another family.
  if exists (select from qurtag.household_members m join qurtag.households h on h.id = m.household_id
             where h.owner_user_id = v_me and m.role = 'member') then
    raise exception 'owner_has_family';
  end if;
  -- One family at a time. A membership that is paused (its plan lapsed) does not count.
  delete from qurtag.household_members m
  where m.user_id = v_me and m.role = 'member' and qurtag.household_plan(m.household_id) <> 'family';
  if exists (select from qurtag.household_members m where m.user_id = v_me and m.role = 'member') then
    raise exception 'already_in_family';
  end if;
  insert into qurtag.household_members (household_id, user_id, role) values (v_inv.household_id, v_me, 'member');
  update qurtag.household_invites set accepted_by = v_me, accepted_at = now() where id = v_inv.id;
  return json_build_object('household_id', v_inv.household_id);
end
$$;

-- A member leaves the family they joined.
create function qurtag.leave_household() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from qurtag.household_members m where m.user_id = v_me and m.role = 'member';
  if not found then raise exception 'not_a_member' using errcode = 'P0002'; end if;
end
$$;

-- The owner removes a member of their household.
create function qurtag.remove_member(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from qurtag.household_members m
  using qurtag.households h
  where m.household_id = h.id and h.owner_user_id = v_me and m.user_id = p_user and m.role = 'member';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end
$$;

create function qurtag.revoke_invite(p_invite uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update qurtag.household_invites i set revoked_at = now()
  from qurtag.households h
  where i.id = p_invite and h.id = i.household_id and h.owner_user_id = v_me
    and i.accepted_at is null and i.revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end
$$;

-- The Family card on the Membership screen: the household the person owns (when it is on
-- Family, or has members or invites) or the one they joined, with its people. Members see
-- each other's names and emails; invites (and who they are for) only the owner sees.
create function qurtag.my_family() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_own uuid;
  v_joined uuid;
  v_h uuid;
  v_role text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select h.id into v_own from qurtag.households h where h.owner_user_id = v_me order by h.created_at limit 1;
  select m.household_id into v_joined from qurtag.household_members m
  where m.user_id = v_me and m.role = 'member' order by m.created_at limit 1;
  if v_joined is not null then
    v_h := v_joined; v_role := 'member';
  elsif v_own is not null and (qurtag.household_plan(v_own) = 'family'
        or exists (select from qurtag.household_members m where m.household_id = v_own and m.role = 'member')) then
    v_h := v_own; v_role := 'owner';
  else
    return json_build_object('role', 'none');
  end if;
  return json_build_object(
    'role', v_role,
    'household_id', v_h,
    'active', qurtag.household_plan(v_h) = 'family',
    'seats_total', 5,
    'members', (
      select coalesce(json_agg(json_build_object(
        'user_id', u."id", 'name', u."name", 'email', u."email",
        'role', case when m.role = 'admin' then 'owner' else 'member' end,
        'joined_at', m.created_at, 'is_me', u."id" = v_me) order by (m.role = 'admin') desc, m.created_at), '[]'::json)
      from qurtag.household_members m join qurtag.auth_users u on u."id" = m.user_id
      where m.household_id = v_h),
    'invites', case when v_role = 'owner' then (
      select coalesce(json_agg(json_build_object('id', i.id, 'email', i.email, 'expires_at', i.expires_at) order by i.created_at), '[]'::json)
      from qurtag.household_invites i
      where i.household_id = v_h and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) end
  );
end
$$;

-- 3. The owner's note email reaches every active member --------------------------------------------

create or replace function qurtag.server_finder_message_notice(p_message_id uuid)
returns table (owner_email text, item_name text)
language sql stable security definer set search_path = '' as $$
  select u."email", i.name
  from qurtag.messages m
  join qurtag.threads t on t.id = m.thread_id
  join qurtag.items i on i.id = t.item_id
  join qurtag.households h on h.id = t.household_id
  join qurtag.household_members hm on hm.household_id = h.id
  join qurtag.auth_users u on u."id" = hm.user_id
  where m.id = p_message_id and m.sender_kind = 'finder'
    and (hm.role = 'admin' or qurtag.household_plan(h.id) = 'family')
$$;

-- Daily tidying also forgets invites that ended a month ago.
create or replace function qurtag.server_membership_sweep() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  update qurtag.subscriptions s set status = 'expired', updated_at = now()
  where s.status in ('active', 'canceling', 'billing_issue') and not qurtag.subscription_counts(s);
  get diagnostics n = row_count;
  perform qurtag.sync_plan_tier(h.id) from qurtag.households h where h.plan_tier is distinct from qurtag.household_plan(h.id);
  delete from qurtag.billing_events where received_at < now() - interval '120 days';
  -- Invites that are over (used, canceled or expired) are forgotten 30 days after.
  delete from qurtag.household_invites i
  where coalesce(i.accepted_at, i.revoked_at, i.expires_at) < now() - interval '30 days';
  return n;
end
$$;

-- 4. Rights ----------------------------------------------------------------------------------------

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.household_invites from %s', api_role);
      execute format('revoke all on all functions in schema qurtag from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function qurtag.invite_preview(text), qurtag.accept_invite(text), qurtag.leave_household(),
  qurtag.remove_member(uuid), qurtag.revoke_invite(uuid), qurtag.my_family()
  to qurtag_user;
grant execute on function qurtag.server_create_invite(uuid, uuid, text, text) to qurtag_server;

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.household_invites', 'SELECT') or has_table_privilege(r.oid, 'qurtag.household_invites', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.household_invites', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.household_invites', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on the invites table: %', bad; end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_create_invite(uuid, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.accept_invite(text)', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
end
$$;

reset check_function_bodies;

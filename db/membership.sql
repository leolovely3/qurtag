-- QuR Tag: paid memberships (Free, Plus, Family). Applied after db/qurtag.sql and
-- db/logins.sql, as `postgres`, in one transaction. It refuses to run twice. The rollout
-- file ~/Claude/Rollouts/QurTag-rollout-schema/5-membership.sql is this file plus a
-- migration record. It works with or without the Super Admin role (db/admin.sql): it
-- changes nothing that file changes. db/family.sql (rollout step 6) adds the Family
-- household on top of it.
--
-- The plans
--   Free    3 items, 1 person. Scan history: the last 30 days.
--   Plus    unlimited items and the full scan history, 1 person.
--   Family  as Plus, shared by up to 5 people (db/family.sql).
--
-- One entitlement, two ways to pay
--   qurtag.subscriptions   one row per paid subscription, whoever sold it: Stripe (the web)
--                          or Apple (the iPhone app, through RevenueCat). A membership is
--                          attached to the buyer's own household. A person who somehow has
--                          two (one bought on the web, one on the iPhone) gets the better
--                          plan of the two; neither overwrites the other.
--   qurtag.household_plan  the one place that turns rows into a plan. Computed from the rows
--                          and the clock each time, so a lapsed membership stops counting even
--                          if no webhook ever says so. households.plan_tier only mirrors it.
--   Rows are written ONLY by server_apply_subscription, which the two webhook routes call as
--   `qurtag_server` after checking the sender's signature or secret. No screen, request or
--   owner can write them: no role the app uses has any right on the tables.
--
-- Webhooks are idempotent. Every delivery carries an id; qurtag.billing_events keeps it, and
-- a second delivery of the same id changes nothing. An older event never overwrites a newer
-- one (each subscription row remembers the time of the last event applied).
--
-- Downgrading never deletes anything. Past the plan's item limit, the OLDEST items stay
-- editable and the rest become read-only: nothing can be changed on them (no edit, no lost
-- switch, no new tag), but they can still be read, deleted, and a finder who scans their tag
-- still sees the card and can write, and the owner can still reply. Delete an item, or
-- upgrade, and the next oldest becomes editable again. The rule is in the database:
-- guard_item and guard_tag refuse the change, create_item refuses a new item.
--
-- Time slack: a membership counts for 2 days past its period end while its last status is
-- "active", because a renewal's webhook can arrive late and a paying customer must not lose
-- their plan in the meantime. A cancelled one (auto-renew off) ends exactly at its period end.
--
-- What it changes in the rules db/qurtag.sql made (undo: rollout file undo-5-membership.sql)
--   create_item        the limit follows the plan (it was a fixed 2; the rollout file 11-free-three.sql moved Free to 3).
--   guard_item         also refuses a change to a read-only item.
--   own_scans_read     a Free household sees the last 30 days of scans, a paid one all.
--   delete_my_account  refuses while a membership still renews (it would keep charging).
--   households.plan_tier now free, plus or family (was fixed at free).

set check_function_bodies = off;

do $$
begin
  if to_regnamespace('qurtag') is null then
    raise exception 'apply db/qurtag.sql first';
  end if;
  if to_regclass('qurtag.subscriptions') is not null then
    raise exception 'memberships are already installed; nothing was changed';
  end if;
end
$$;

-- 1. Tables (no role the app uses has any right on them) -------------------------------

create table qurtag.subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'apple')),
  -- Stripe: the subscription id (sub_...). Apple: the original transaction id.
  external_id text not null check (length(external_id) between 1 and 200),
  user_id uuid not null references qurtag.auth_users ("id") on delete cascade,
  -- The buyer's own household: the one the plan is attached to.
  household_id uuid not null references qurtag.households (id) on delete cascade,
  plan text not null check (plan in ('plus', 'family')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  -- active: renews. canceling: auto-renew is off, the plan lasts to current_period_end.
  -- billing_issue: the last payment failed, the provider is still retrying.
  -- expired / refunded: over.
  status text not null check (status in ('active', 'canceling', 'billing_issue', 'expired', 'refunded')),
  current_period_end timestamptz not null,
  external_customer text,
  last_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index subscriptions_household_idx on qurtag.subscriptions (household_id);
create index subscriptions_user_idx on qurtag.subscriptions (user_id);

-- The Stripe customer of an account, so the customer portal can open and a later event
-- finds its owner even when it carries no account id.
create table qurtag.billing_customers (
  user_id uuid primary key references qurtag.auth_users ("id") on delete cascade,
  stripe_customer_id text not null unique check (length(stripe_customer_id) between 1 and 200),
  created_at timestamptz not null default now()
);

-- Every webhook delivery already applied: its id is the idempotency key.
create table qurtag.billing_events (
  provider text not null check (provider in ('stripe', 'apple')),
  event_id text not null check (length(event_id) between 1 and 200),
  event_type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table qurtag.subscriptions enable row level security;
alter table qurtag.billing_customers enable row level security;
alter table qurtag.billing_events enable row level security;

alter table qurtag.households drop constraint households_plan_tier_check;
alter table qurtag.households add constraint households_plan_tier_check check (plan_tier in ('free', 'plus', 'family'));

-- 2. What a plan means -------------------------------------------------------------------

-- A subscription that counts right now.
create function qurtag.subscription_counts(s qurtag.subscriptions) returns boolean
language sql stable set search_path = '' as $$
  select s.status in ('active', 'canceling', 'billing_issue')
     and s.current_period_end + (case when s.status = 'active' then interval '2 days' else interval '0 days' end) > now()
$$;

-- 'free', 'plus' or 'family' for a household, from its subscriptions and the clock.
create function qurtag.household_plan(p_household uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when count(*) = 0 then null when bool_or(s.plan = 'family') then 'family' else 'plus' end
    from qurtag.subscriptions s
    where s.household_id = p_household and qurtag.subscription_counts(s)
  ), 'free')
$$;

-- How many items a household may have: 3 on Free, no limit (null) on Plus and Family.
create function qurtag.household_item_limit(p_household uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when qurtag.household_plan(p_household) = 'free' then 3 end
$$;

-- Whether an item may be changed: it is within its household's limit, counting from the
-- oldest. An item that does not exist counts as editable (nothing to protect).
create function qurtag.item_is_editable(p_item uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid;
  v_created timestamptz;
  v_limit integer;
begin
  select i.household_id, i.created_at into v_household, v_created from qurtag.items i where i.id = p_item;
  if not found then return true; end if;
  v_limit := qurtag.household_item_limit(v_household);
  if v_limit is null then return true; end if;
  return (select count(*) from qurtag.items x
          where x.household_id = v_household and (x.created_at, x.id) < (v_created, p_item)) < v_limit;
end
$$;

-- Keeps households.plan_tier equal to household_plan (a mirror for screens and counts).
create function qurtag.sync_plan_tier(p_household uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update qurtag.households h set plan_tier = qurtag.household_plan(h.id)
  where h.id = p_household and h.plan_tier is distinct from qurtag.household_plan(h.id)
$$;

-- 3. Rules the plan changes ----------------------------------------------------------------

-- The household new items go into. Until Family exists this is the person's own.
create function qurtag.primary_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.household_id from qurtag.household_members m
     where m.user_id = qurtag.current_account() and m.role = 'admin'
     order by m.created_at limit 1),
    (select m.household_id from qurtag.household_members m
     where m.user_id = qurtag.current_account() order by m.created_at limit 1))
$$;

create or replace function qurtag.create_item(p_name text, p_brand text default null, p_color text default null,
                                              p_photo text default null, p_reward_text text default null,
                                              p_notes text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_household uuid;
  v_limit integer;
  v_item uuid;
  v_tag uuid;
  v_public text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_household := qurtag.primary_household();
  if v_household is null then raise exception 'no_household' using errcode = '42501'; end if;
  -- The limit follows the plan. The lock keeps two requests at once from both passing the count.
  perform 1 from qurtag.households h where h.id = v_household for update;
  v_limit := qurtag.household_item_limit(v_household);
  if v_limit is not null and (select count(*) from qurtag.items i where i.household_id = v_household) >= v_limit then
    raise exception 'item_limit';
  end if;
  insert into qurtag.items (household_id, name, brand, color, hero_photo_url, reward_text, notes)
  values (v_household, btrim(p_name), nullif(btrim(p_brand), ''), nullif(btrim(p_color), ''),
          nullif(p_photo, ''), nullif(btrim(p_reward_text), ''), nullif(btrim(p_notes), ''))
  returning id into v_item;
  loop
    v_public := qurtag.new_public_id();
    exit when not exists (select from qurtag.tags t where t.public_id = v_public);
  end loop;
  insert into qurtag.tags (public_id, household_id, current_item_id)
  values (v_public, v_household, v_item)
  returning id into v_tag;
  return json_build_object('item_id', v_item, 'tag_id', v_tag, 'public_id', v_public);
end
$$;

-- An owner may change their own item's details but never move it to another household,
-- and never change one that is past the plan's limit.
create or replace function qurtag.guard_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'qurtag_user' then
    if new.household_id is distinct from old.household_id
       or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'That cannot be changed.' using errcode = '42501';
    end if;
    if not qurtag.item_is_editable(old.id) then
      raise exception 'read_only_item' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- A tag of a read-only item cannot be switched off or on, and no new tag can be made for it
-- (replace_tag inserts one). The finder's page is not affected: it only reads tags.
create function qurtag.guard_tag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.current_item_id is not null and not qurtag.item_is_editable(new.current_item_id) then
      raise exception 'read_only_item' using errcode = '42501';
    end if;
  elsif current_user = 'qurtag_user' and old.current_item_id is not null
        and not qurtag.item_is_editable(old.current_item_id) then
    raise exception 'read_only_item' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_tag_insert before insert on qurtag.tags
  for each row execute function qurtag.guard_tag();
create trigger guard_tag_update before update on qurtag.tags
  for each row execute function qurtag.guard_tag();

-- Free sees the last 30 days of scans, Plus and Family see them all.
drop policy own_scans_read on qurtag.scans;
create policy own_scans_read on qurtag.scans for select to qurtag_user
  using (
    tag_id in (select t.id from qurtag.tags t where t.household_id in (select qurtag.my_household_ids()))
    and (scanned_at > now() - interval '30 days'
         or qurtag.household_plan((select t.household_id from qurtag.tags t where t.id = scans.tag_id)) <> 'free')
  );

-- Deleting an account deletes its household, so a membership that still renews would keep
-- charging for nothing. Refuse until it is cancelled (the screen says where).
create or replace function qurtag.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if exists (select from qurtag.subscriptions s
             where s.user_id = v_me and s.status in ('active', 'billing_issue') and qurtag.subscription_counts(s)) then
    raise exception 'membership_active';
  end if;
  delete from qurtag.auth_users where "id" = v_me;
end
$$;

-- 4. For the owner's screens (qurtag_user) -----------------------------------------------------

-- Everything the Membership screen and the item screens need to know about the signed-in
-- person's plan, in one answer.
create function qurtag.my_membership() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
  v_own uuid;
  v_primary uuid;
  v_limit integer;
  v_best qurtag.subscriptions;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select h.id into v_own from qurtag.households h where h.owner_user_id = v_me order by h.created_at limit 1;
  v_primary := qurtag.primary_household();
  v_limit := qurtag.household_item_limit(v_primary);
  select s.* into v_best from qurtag.subscriptions s
  where s.household_id = v_own and qurtag.subscription_counts(s)
  order by (s.plan = 'family') desc, s.current_period_end desc limit 1;
  return json_build_object(
    'own_household_id', v_own,
    'household_id', v_primary,
    -- What the person pays for.
    'plan', qurtag.household_plan(v_own),
    -- What governs the items they see (a Family member gets the family's plan).
    'items_plan', qurtag.household_plan(v_primary),
    'item_limit', v_limit,
    'items_used', (select count(*) from qurtag.items i where i.household_id = v_primary),
    'can_add_items', v_limit is null or (select count(*) from qurtag.items i where i.household_id = v_primary) < v_limit,
    'provider', v_best.provider,
    'billing_interval', v_best.billing_interval,
    'status', coalesce(v_best.status, 'none'),
    'renews', coalesce(v_best.status in ('active', 'billing_issue'), false),
    'period_end', v_best.current_period_end,
    -- Items past the limit, in any household the person can see.
    'read_only_item_ids', coalesce((
      select json_agg(i.id) from qurtag.items i
      where i.household_id in (select qurtag.my_household_ids()) and not qurtag.item_is_editable(i.id)), '[]'::json)
  );
end
$$;

-- 5. For the server routes (qurtag_server only) ----------------------------------------------------

-- Whether a pass's session is still alive, and who it is: the checkout and portal routes
-- call this after checking the pass itself.
create function qurtag.server_account(p_user uuid, p_session uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'user_id', u."id",
    'email', u."email",
    'name', u."name",
    'household_id', (select h.id from qurtag.households h where h.owner_user_id = u."id" order by h.created_at limit 1),
    'stripe_customer_id', (select c.stripe_customer_id from qurtag.billing_customers c where c.user_id = u."id"),
    -- Who sells the membership that counts now, so a second one is not started.
    'live_providers', coalesce((
      select json_agg(distinct s.provider) from qurtag.subscriptions s
      where s.user_id = u."id" and qurtag.subscription_counts(s)), '[]'::json),
    'live_stripe_customer', (
      select s.external_customer from qurtag.subscriptions s
      where s.user_id = u."id" and s.provider = 'stripe' order by s.last_event_at desc limit 1)
  )
  from qurtag.auth_sessions s join qurtag.auth_users u on u."id" = s."userId"
  where s."id" = p_session and s."userId" = p_user and s."expiresAt" > now()
$$;

-- Remembers which Stripe customer is this account (checkout.session.completed).
create function qurtag.server_link_stripe_customer(p_user uuid, p_customer text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$'
     or not exists (select from qurtag.auth_users u where u."id" = p_user) then
    return false;
  end if;
  insert into qurtag.billing_customers (user_id, stripe_customer_id) values (p_user, p_customer)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id;
  return true;
end
$$;

-- Records one subscription event from a payment provider and makes the plan follow it.
-- Answers 'applied', 'duplicate' (this delivery was already applied), 'stale' (a newer event
-- was already applied to this subscription) or 'unknown_user' (nobody to attach it to: an
-- account that was deleted, or an event for another product; nothing is recorded, so a
-- later delivery can still succeed). Everything happens in one transaction: an error leaves
-- no trace, and the provider tries again.
--   p_user          the account when the event names one (else found by customer or by
--                   the subscription's earlier rows)
--   p_keep_higher   an event that must not lower a plan already held (an upgrade's
--                   announcement, which can arrive before the new period starts)
create function qurtag.server_apply_subscription(
  p_provider text, p_event_id text, p_event_type text, p_event_at timestamptz,
  p_user uuid, p_customer text, p_external_id text,
  p_plan text, p_interval text, p_status text, p_period_end timestamptz, p_keep_higher boolean default false)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := p_user;
  v_household uuid;
  v_existing qurtag.subscriptions;
  v_plan text := p_plan;
begin
  if p_provider not in ('stripe', 'apple') then raise exception 'bad_provider'; end if;
  if p_plan not in ('plus', 'family') or p_interval not in ('month', 'year')
     or p_status not in ('active', 'canceling', 'billing_issue', 'expired', 'refunded') then
    raise exception 'bad_subscription';
  end if;
  select * into v_existing from qurtag.subscriptions s where s.provider = p_provider and s.external_id = p_external_id;
  if v_user is null and found then v_user := v_existing.user_id; end if;
  if v_user is null and p_customer is not null then
    select c.user_id into v_user from qurtag.billing_customers c where c.stripe_customer_id = p_customer;
  end if;
  if v_user is null or not exists (select from qurtag.auth_users u where u."id" = v_user) then
    return 'unknown_user';
  end if;

  insert into qurtag.billing_events (provider, event_id, event_type) values (p_provider, p_event_id, left(p_event_type, 80))
  on conflict do nothing;
  if not found then return 'duplicate'; end if;

  if v_existing.id is not null and v_existing.last_event_at > p_event_at then
    return 'stale';
  end if;
  if v_existing.id is not null and p_keep_higher and v_existing.plan = 'family' and v_plan = 'plus'
     and qurtag.subscription_counts(v_existing) then
    v_plan := 'family';
  end if;

  select h.id into v_household from qurtag.households h where h.owner_user_id = v_user order by h.created_at limit 1;
  if v_household is null then return 'unknown_user'; end if;

  insert into qurtag.subscriptions (provider, external_id, user_id, household_id, plan, billing_interval, status,
                                    current_period_end, external_customer, last_event_at)
  values (p_provider, p_external_id, v_user, v_household, v_plan, p_interval, p_status,
          p_period_end, p_customer, p_event_at)
  on conflict (provider, external_id) do update
  set plan = excluded.plan, billing_interval = excluded.billing_interval, status = excluded.status,
      current_period_end = excluded.current_period_end,
      external_customer = coalesce(excluded.external_customer, qurtag.subscriptions.external_customer),
      last_event_at = excluded.last_event_at, updated_at = now();

  if p_provider = 'stripe' and p_customer is not null then
    insert into qurtag.billing_customers (user_id, stripe_customer_id) values (v_user, p_customer)
    on conflict (user_id) do nothing;
  end if;
  perform qurtag.sync_plan_tier(v_household);
  return 'applied';
end
$$;

-- Daily: memberships past their end stop counting (the plan is computed from the clock
-- anyway; this tidies the rows and the plan_tier mirror).
create function qurtag.server_membership_sweep() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  update qurtag.subscriptions s set status = 'expired', updated_at = now()
  where s.status in ('active', 'canceling', 'billing_issue') and not qurtag.subscription_counts(s);
  get diagnostics n = row_count;
  perform qurtag.sync_plan_tier(h.id) from qurtag.households h where h.plan_tier is distinct from qurtag.household_plan(h.id);
  delete from qurtag.billing_events where received_at < now() - interval '120 days';
  return n;
end
$$;

-- 6. Rights ---------------------------------------------------------------------------------------

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.subscriptions, qurtag.billing_customers, qurtag.billing_events from %s', api_role);
      execute format('revoke all on all functions in schema qurtag from %s', api_role);
    end if;
  end loop;
end
$$;

grant execute on function qurtag.my_membership(), qurtag.primary_household(), qurtag.household_plan(uuid),
  qurtag.household_item_limit(uuid), qurtag.item_is_editable(uuid), qurtag.subscription_counts(qurtag.subscriptions)
  to qurtag_user;
grant execute on function
  qurtag.server_account(uuid, uuid),
  qurtag.server_link_stripe_customer(uuid, text),
  qurtag.server_apply_subscription(text, text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, boolean),
  qurtag.server_membership_sweep()
  to qurtag_server;

-- 7. Checks before finishing --------------------------------------------------------------------------

do $$
declare
  bad text;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.subscriptions', 'SELECT') or has_table_privilege(r.oid, 'qurtag.subscriptions', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.subscriptions', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.subscriptions', 'DELETE')
         or has_table_privilege(r.oid, 'qurtag.billing_customers', 'SELECT') or has_table_privilege(r.oid, 'qurtag.billing_events', 'SELECT')
         or has_table_privilege(r.oid, 'qurtag.billing_customers', 'INSERT') or has_table_privilege(r.oid, 'qurtag.billing_events', 'INSERT'));
  if bad is not null then raise exception 'a role has rights on the billing tables: %', bad; end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_apply_subscription(text, text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, boolean)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.my_membership()', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
end
$$;

reset check_function_bodies;

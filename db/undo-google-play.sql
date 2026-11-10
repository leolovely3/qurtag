-- Undo of db/google-play.sql (rollout step 15). As `postgres`, in one transaction.
-- Refuses while any Google Play subscription or billing event is recorded: removing them would take
-- paid members' plans away. Android platform rows are deleted (they are counts only).

do $$
begin
  if exists (select from qurtag.subscriptions where provider = 'google')
     or exists (select from qurtag.billing_events where provider = 'google') then
    raise exception 'Google Play subscriptions are recorded; nothing was changed';
  end if;
end
$$;

delete from qurtag.app_platforms where platform = 'android';
alter table qurtag.subscriptions drop constraint subscriptions_provider_check;
alter table qurtag.subscriptions add constraint subscriptions_provider_check check (provider in ('stripe', 'apple'));
alter table qurtag.billing_events drop constraint billing_events_provider_check;
alter table qurtag.billing_events add constraint billing_events_provider_check check (provider in ('stripe', 'apple'));
alter table qurtag.app_platforms drop constraint app_platforms_platform_check;
alter table qurtag.app_platforms add constraint app_platforms_platform_check check (platform in ('ios', 'web'));

-- The functions as db/membership.sql and db/measures.sql have them.
create or replace function qurtag.server_apply_subscription(
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

create or replace function qurtag.record_app_platform(p_platform text) returns void
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

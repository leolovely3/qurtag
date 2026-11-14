-- Undo db/page-views.sql (rollout step 18). WHAT IT CANNOT UNDO: every page view count is deleted with the table.
-- factory_metrics goes back to the figures it answered before (db/measures.sql). Nothing outside schema qurtag
-- changes but the migration record.
do $$
begin
  if to_regclass('qurtag.site_visits') is null then
    raise exception 'the page view counter is not installed; nothing was changed';
  end if;
end
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

drop function qurtag.record_visit(text, text);
drop table qurtag.site_visits;

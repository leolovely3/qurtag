-- Undo the measures (db/measures.sql, rollout step 12) and put schema qurtag back as it was.
--
-- WHAT IT CANNOT UNDO: everything the measures recorded is deleted with its column or table: when each
-- conversation was marked "I have it back" (the conversations stay, and still read 'Back with you'), every
-- account's sign-up channel, the print events and the platform records. factory_metrics goes back to the
-- figures it answered before. Touches nothing outside schema qurtag but the migration record.
-- Refuses to run unless step 12 was run. Run it before undo-9-moderation.sql.
do $$
begin
  if to_regclass('qurtag.tag_print_events') is null then
    raise exception 'the measures are not installed; nothing was changed';
  end if;
end
$$;

create or replace function qurtag.factory_metrics(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or not exists (
    select from qurtag.factory_access a
    where a.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
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
    'scans_30d', (select count(*) from qurtag.scans where scanned_at > now() - interval '30 days'),
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
                                 from qurtag.message_reports where status = 'open')
  );
end
$$;

drop trigger threads_mark_returned on qurtag.threads;
drop function qurtag.threads_mark_returned();
alter table qurtag.threads drop constraint threads_returned_check;
drop index qurtag.threads_returned_idx;
alter table qurtag.threads drop column returned_at;
drop trigger auth_users_keep_channel on qurtag.auth_users;
drop function qurtag.auth_users_keep_channel();
alter table qurtag.auth_users drop column signup_channel;
drop function qurtag.record_tag_print(text, text, text, text, text);
drop function qurtag.record_app_platform(text);
drop function qurtag.measure_signups_by_channel(integer);
drop function qurtag.measure_scans_with_note(integer);
drop function qurtag.measure_paid(text, text);
drop function qurtag.measure_printed(text);
drop function qurtag.measure_households_by_limit(boolean);
drop table qurtag.tag_print_events;
drop table qurtag.app_platforms;

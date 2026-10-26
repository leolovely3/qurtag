-- Undo the finder loop changes (db/ux-fixes.sql, rollout step 13) and put schema qurtag back as rollout
-- step 12 left it: the finder functions, owner_reply, server_owner_reply and my_held_notes as they were.
--
-- WHAT IT CANNOT UNDO: everything step 13 recorded is deleted with its column or table: finders' emails
-- (no more reply emails; any waiting in the outbox are dropped), the network keys and the blocks by
-- network (blocked conversations stay blocked), the pause marks (paused items take new notes again),
-- the archive marks (archived conversations are back in the inbox) and who wrote each owner reply.
-- Conversation codes stop working, because the server that reads them needs step 13; the tokens they
-- made still work as before. Touches nothing outside schema qurtag but the migration record.
-- Refuses to run unless step 13 was run.
do $$
begin
  if to_regclass('qurtag.finder_blocks') is null then
    raise exception 'the finder loop changes are not installed; nothing was changed';
  end if;
end
$$;

set check_function_bodies = off;

drop trigger messages_finder_loop on qurtag.messages;
drop trigger threads_finder_loop on qurtag.threads;
drop function qurtag.after_message_finder_loop();
drop function qurtag.threads_finder_loop();
drop function qurtag.queue_finder_reply(uuid, timestamptz);
drop function qurtag.server_finder_resume(text, text);
drop function qurtag.server_finder_set_email(text, text, text);
drop function qurtag.server_finder_reply_due(uuid);
drop function qurtag.server_finder_reply_sent(uuid, timestamptz);
drop function qurtag.server_finder_email_forget(uuid);
drop function qurtag.server_finder_sweep();
drop function qurtag.set_item_notes_paused(uuid, boolean);
drop function qurtag.server_finder_open(text, text, text, text, text);

-- As db/moderation.sql made them.
create or replace function qurtag.server_finder_view(p_public_id text, p_token text, p_device text, p_record_scan boolean)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_item qurtag.items%rowtype;
  v_thread qurtag.threads%rowtype;
  v_messages json;
begin
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then return null; end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active';
  if not found or v_tag.current_item_id is null then return null; end if;
  select * into v_item from qurtag.items where id = v_tag.current_item_id;
  if not found then return null; end if;
  if p_record_scan then
    insert into qurtag.scans (tag_id, item_id, user_agent_class) values (v_tag.id, v_item.id, left(p_device, 20));
  end if;
  if p_token is not null and length(p_token) between 32 and 128 then
    select * into v_thread from qurtag.threads
    where finder_token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and tag_id = v_tag.id;
    if found then
      update qurtag.messages set read_by_finder_at = now()
      where thread_id = v_thread.id and sender_kind <> 'finder' and read_by_finder_at is null;
      select coalesce(json_agg(json_build_object('id', m.id, 'sender_kind', m.sender_kind, 'body', m.body,
                                                 'created_at', m.created_at) order by m.created_at), '[]'::json)
      into v_messages from qurtag.messages m where m.thread_id = v_thread.id and m.hidden_at is null;
    end if;
  end if;
  return json_build_object(
    'item', json_build_object('name', v_item.name, 'photo', v_item.hero_photo_url,
                              'reward_text', v_item.reward_text, 'lost', v_item.lost_mode),
    'tag', json_build_object('public_id', v_tag.public_id),
    'thread', case when v_thread.id is null then null
                   else json_build_object('status', case when v_thread.blocked_at is not null then 'closed' else v_thread.status end,
                                          'messages', v_messages) end
  );
end
$$;

create function qurtag.server_finder_open(p_public_id text, p_token text, p_body text, p_hold text default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_tag qurtag.tags%rowtype;
  v_household uuid;
  v_thread uuid;
begin
  if p_token is null or length(p_token) not between 32 and 128 then raise exception 'bad_token'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if p_hold is not null and p_hold not in ('language', 'threat') then raise exception 'bad_token'; end if;
  if p_public_id is null or p_public_id !~ '^[2-9A-HJ-NP-Za-km-z]{12}$' then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  select * into v_tag from qurtag.tags where public_id = p_public_id and status = 'active' for share;
  if not found or v_tag.current_item_id is null then raise exception 'tag_not_found' using errcode = 'P0002'; end if;
  select household_id into v_household from qurtag.items where id = v_tag.current_item_id;
  if (select count(*) from qurtag.threads t where t.tag_id = v_tag.id and t.created_at > now() - interval '1 day') >= 20
     or (select count(*) from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
         where t.tag_id = v_tag.id and m.sender_kind = 'finder' and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too_many';
  end if;
  insert into qurtag.threads (item_id, household_id, tag_id, finder_token_sha256)
  values (v_tag.current_item_id, v_household, v_tag.id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
  returning id into v_thread;
  insert into qurtag.messages (thread_id, sender_kind, body, held_at, held_reason)
  values (v_thread, 'finder', left(btrim(p_body), 2000), case when p_hold is not null then now() end, p_hold);
  return json_build_object('ok', true);
end
$$;

create or replace function qurtag.my_held_notes(p_thread uuid default null) returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.created_at), '[]'::json) from (
    select m.id, m.thread_id, m.created_at, m.read_by_owner_at is not null as read
    from qurtag.messages m join qurtag.threads t on t.id = m.thread_id
    where m.held_at is not null and m.held_released_at is null and m.hidden_at is null and m.owner_hidden_at is null
      and t.blocked_at is null and t.household_id in (select qurtag.my_household_ids())
      and (p_thread is null or m.thread_id = p_thread)
  ) x
$$;

-- As db/qurtag.sql made it.
create or replace function qurtag.owner_reply(p_thread_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not exists (select from qurtag.threads t
                 where t.id = p_thread_id and t.household_id in (select qurtag.my_household_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  insert into qurtag.messages (thread_id, sender_kind, body)
  values (p_thread_id, 'owner', left(btrim(p_body), 2000))
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread_id and sender_kind = 'finder' and read_by_owner_at is null;
  return v_id;
end
$$;

-- As db/push.sql made it.
create or replace function qurtag.server_owner_reply(p_user uuid, p_session uuid, p_thread uuid, p_body text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not qurtag.push_session_ok(p_user, p_session) then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if not exists (
    select from qurtag.threads t
    where t.id = p_thread and t.household_id in (
      select hm.household_id from qurtag.household_members hm
      where hm.user_id = p_user and (hm.role = 'admin' or qurtag.household_plan(hm.household_id) = 'family'))
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into qurtag.messages (thread_id, sender_kind, body)
  values (p_thread, 'owner', left(btrim(p_body), 2000))
  returning id into v_id;
  update qurtag.messages set read_by_owner_at = now()
  where thread_id = p_thread and sender_kind = 'finder' and read_by_owner_at is null;
  return json_build_object('message_id', v_id, 'unread', qurtag.push_unread_for(p_user));
end
$$;

revoke all on function qurtag.server_finder_open(text, text, text, text) from public;
grant execute on function qurtag.server_finder_open(text, text, text, text) to qurtag_server;

delete from qurtag.outbox where kind = 'finder_reply';
alter table qurtag.outbox drop constraint outbox_kind_check;
alter table qurtag.outbox add constraint outbox_kind_check
  check (kind in ('finder_message', 'push_email', 'push_scan', 'admin_alert'));

drop table qurtag.finder_blocks;
alter table qurtag.threads
  drop constraint threads_finder_email_check,
  drop column finder_net_key,
  drop column archived_at,
  drop column finder_email_enc,
  drop column finder_email_at,
  drop column finder_email_sent_at;
alter table qurtag.items drop column notes_paused_at;
alter table qurtag.messages drop column sender_user_id;

reset check_function_bodies;

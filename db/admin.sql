-- QuR Tag: the Super Admin role. Applied after db/qurtag.sql and db/logins.sql, as
-- `postgres`, in one transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/3-admin.sql is this file plus a migration record.
--
-- What it adds
--   qurtag.super_admins   who is a super admin. Rows are written ONLY by a rollout file run
--                         as `postgres` (4-make-admin.sql). No role the app uses has any
--                         right on the table, and no function the app can call writes it,
--                         so no screen, request or admin can make someone a super admin.
--   qurtag.admin_audit    one row for every admin action: who, what, when, and the thing it
--                         was done to. Written by the same function that does the action,
--                         inside the same transaction, so an action cannot happen without
--                         its row. Append only: a trigger refuses update and delete.
--                         Nobody the app uses can read or write it.
--   the admin_* functions what the /app/admin screens call (through the data API, as the
--                         signed-in person). Each one starts by calling qurtag.admin_check(),
--                         which raises 'not_authorized' unless the live session behind the
--                         pass belongs to a super admin. That is the server-side check for
--                         every admin action; hiding the screen in the app is only courtesy.
--
-- What an admin can see and do
--   see      counts; accounts (email, joined, item count); an account's items, tags,
--            conversations and messages (the text, and whether it is hidden).
--   do       switch a tag off (and back on); hide (and unhide) a message; delete an account
--            after typing its email.
--   never    a finder's conversation token or its hash (threads.finder_token_sha256), sign-in
--            data (passwords, sessions, keys), an item's private notes or photo. None of the
--            admin_* functions reads those columns.
--   not      delete a super admin's account (undo the flag first, with a rollout file).
--
-- A tag an admin switched off keeps a mark (tags.disabled_by_admin_at). The owner cannot
-- switch it back on (the owner's update rule refuses) and replace_tag refuses for that
-- item, so the owner cannot get around it. A hidden message (messages.hidden_at) is left
-- out of the owner's reads and of the finder's page.
--
-- Undo: undo-3-admin.sql puts everything back as db/qurtag.sql made it. It also drops the
-- audit log and the hidden marks.

set check_function_bodies = off;

do $$
begin
  if to_regnamespace('qurtag') is null then
    raise exception 'apply db/qurtag.sql first; nothing was changed';
  end if;
  if to_regclass('qurtag.super_admins') is not null then
    raise exception 'the admin role is already installed; nothing was changed';
  end if;
end
$$;

-- 1. Tables -------------------------------------------------------------------------

create table qurtag.super_admins (
  user_id uuid primary key references qurtag.auth_users ("id") on delete cascade,
  granted_at timestamptz not null default now()
);

-- No foreign key on purpose: deleting an account must never delete or block the record
-- of who deleted it, and an admin's own account may later be removed.
create table qurtag.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid not null,
  actor_email text not null,
  action text not null check (action in (
    'view_overview', 'list_accounts', 'view_account',
    'disable_tag', 'enable_tag', 'hide_message', 'unhide_message', 'delete_account')),
  target_type text check (target_type in ('account', 'tag', 'message')),
  target_id text,
  detail jsonb not null default '{}'::jsonb
);
create index admin_audit_at_idx on qurtag.admin_audit (at desc);

create function qurtag.admin_audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'the admin log can only be added to';
end
$$;
create trigger admin_audit_no_change before update or delete on qurtag.admin_audit
  for each row execute function qurtag.admin_audit_append_only();
create trigger admin_audit_no_truncate before truncate on qurtag.admin_audit
  for each statement execute function qurtag.admin_audit_append_only();

alter table qurtag.tags add column disabled_by_admin_at timestamptz;
alter table qurtag.messages add column hidden_at timestamptz;
alter table qurtag.messages add column hidden_by uuid;

alter table qurtag.super_admins enable row level security;
alter table qurtag.admin_audit enable row level security;
-- No policy and no grant: only the functions below (owned by the schema's owner) touch them.
do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.super_admins, qurtag.admin_audit from %s', api_role);
      execute format('revoke all on all sequences in schema qurtag from %s', api_role);
    end if;
  end loop;
end
$$;

-- 2. The check, and the log ---------------------------------------------------------

-- Whether the signed-in person (a live session) is a super admin. The app asks this to
-- decide whether to show the admin menu; it grants nothing by itself.
create function qurtag.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from qurtag.super_admins a where a.user_id = qurtag.current_account())
$$;

-- Every admin function begins here. Answers the admin's id, or refuses.
create function qurtag.admin_check() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.current_account();
begin
  if v_me is null or not exists (select from qurtag.super_admins a where a.user_id = v_me) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return v_me;
end
$$;

create function qurtag.admin_log(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into qurtag.admin_audit (actor_id, actor_email, action, target_type, target_id, detail)
  values (p_actor, coalesce((select u."email" from qurtag.auth_users u where u."id" = p_actor), ''),
          p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end
$$;

-- 3. What an admin reads --------------------------------------------------------------

create function qurtag.admin_overview() returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
begin
  perform qurtag.admin_log(v_me, 'view_overview', null, null, '{}'::jsonb);
  return json_build_object(
    'accounts', (select count(*) from qurtag.auth_users),
    'accounts_7d', (select count(*) from qurtag.auth_users where "createdAt" > now() - interval '7 days'),
    'accounts_30d', (select count(*) from qurtag.auth_users where "createdAt" > now() - interval '30 days'),
    'items', (select count(*) from qurtag.items),
    'tags', (select count(*) from qurtag.tags),
    'tags_active', (select count(*) from qurtag.tags where status = 'active'),
    'scans_7d', (select count(*) from qurtag.scans where scanned_at > now() - interval '7 days'),
    'scans_30d', (select count(*) from qurtag.scans where scanned_at > now() - interval '30 days'),
    'messages_7d', (select count(*) from qurtag.messages where created_at > now() - interval '7 days'),
    'messages_30d', (select count(*) from qurtag.messages where created_at > now() - interval '30 days')
  );
end
$$;

-- Accounts, newest first. p_search matches part of the email. At most 100 a page.
create function qurtag.admin_list_accounts(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_term text := nullif(btrim(left(coalesce(p_search, ''), 200)), '');
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows json;
begin
  v_like := case when v_term is null then null
                 else '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  perform qurtag.admin_log(v_me, 'list_accounts', null, null,
                           jsonb_build_object('search', v_term, 'offset', v_offset));
  select count(*) into v_total from qurtag.auth_users u where v_like is null or u."email" ilike v_like;
  select coalesce(json_agg(r order by r.joined desc), '[]'::json) into v_rows from (
    select u."id" as id, u."email" as email, u."createdAt" as joined,
           (select count(*) from qurtag.households h join qurtag.items i on i.household_id = h.id
             where h.owner_user_id = u."id") as item_count,
           exists (select from qurtag.super_admins a where a.user_id = u."id") as is_admin
    from qurtag.auth_users u
    where v_like is null or u."email" ilike v_like
    order by u."createdAt" desc, u."id"
    limit v_limit offset v_offset
  ) r;
  return json_build_object('total', v_total, 'accounts', v_rows);
end
$$;

-- One account: its items, tags and conversations. No finder token (or its hash), no
-- sign-in data, no private item notes, no photos.
create function qurtag.admin_account(p_user uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_user qurtag.auth_users%rowtype;
begin
  select * into v_user from qurtag.auth_users where "id" = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform qurtag.admin_log(v_me, 'view_account', 'account', p_user::text, '{}'::jsonb);
  return json_build_object(
    'account', json_build_object(
      'id', v_user."id", 'email', v_user."email", 'joined', v_user."createdAt",
      'is_admin', exists (select from qurtag.super_admins a where a.user_id = v_user."id")),
    'items', (select coalesce(json_agg(json_build_object(
                'id', i.id, 'name', i.name, 'brand', i.brand, 'color', i.color,
                'lost', i.lost_mode, 'reward_text', i.reward_text, 'created_at', i.created_at)
              order by i.created_at), '[]'::json)
              from qurtag.items i join qurtag.households h on h.id = i.household_id
              where h.owner_user_id = p_user),
    'tags', (select coalesce(json_agg(json_build_object(
                'id', t.id, 'public_id', t.public_id, 'item_id', t.current_item_id, 'status', t.status,
                'disabled_by_admin', t.disabled_by_admin_at is not null, 'created_at', t.created_at,
                'scans_30d', (select count(*) from qurtag.scans s
                              where s.tag_id = t.id and s.scanned_at > now() - interval '30 days'))
              order by t.created_at), '[]'::json)
              from qurtag.tags t join qurtag.households h on h.id = t.household_id
              where h.owner_user_id = p_user),
    'threads', (select coalesce(json_agg(x.j order by x.last_at desc), '[]'::json) from (
                  select th.last_message_at as last_at,
                         json_build_object(
                           'id', th.id, 'item_id', th.item_id, 'item_name', i.name, 'status', th.status,
                           'created_at', th.created_at, 'last_message_at', th.last_message_at,
                           'messages', (select coalesce(json_agg(json_build_object(
                                          'id', m.id, 'sender_kind', m.sender_kind, 'body', m.body,
                                          'created_at', m.created_at, 'hidden', m.hidden_at is not null)
                                        order by m.created_at), '[]'::json)
                                        from (select * from qurtag.messages mm where mm.thread_id = th.id
                                              order by mm.created_at desc limit 100) m)) as j
                  from qurtag.threads th
                  join qurtag.items i on i.id = th.item_id
                  join qurtag.households h on h.id = th.household_id
                  where h.owner_user_id = p_user
                  order by th.last_message_at desc limit 50) x)
  );
end
$$;

-- 4. What an admin does --------------------------------------------------------------

-- Switches a tag off (p_active false) or back on (true). A tag switched off by an admin
-- stays off for its owner. Only a tag an admin switched off can be switched back on here.
create function qurtag.admin_set_tag(p_tag uuid, p_active boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_tag qurtag.tags%rowtype;
begin
  if p_active is null then raise exception 'bad_request'; end if;
  select * into v_tag from qurtag.tags where id = p_tag for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_tag.status = 'replaced' then raise exception 'tag_replaced'; end if;
  if p_active then
    if v_tag.disabled_by_admin_at is null then raise exception 'not_disabled_by_admin'; end if;
    update qurtag.tags set status = 'active', disabled_by_admin_at = null where id = p_tag;
  else
    update qurtag.tags set status = 'inactive', disabled_by_admin_at = coalesce(disabled_by_admin_at, now())
    where id = p_tag;
  end if;
  perform qurtag.admin_log(v_me, case when p_active then 'enable_tag' else 'disable_tag' end, 'tag', p_tag::text,
                           jsonb_build_object('public_id', v_tag.public_id, 'was', v_tag.status));
  return json_build_object('id', p_tag, 'status', case when p_active then 'active' else 'inactive' end);
end
$$;

-- Hides a message from the owner's inbox and the finder's page (p_hidden true), or shows it again.
create function qurtag.admin_set_message_hidden(p_message uuid, p_hidden boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_msg qurtag.messages%rowtype;
begin
  if p_hidden is null then raise exception 'bad_request'; end if;
  select * into v_msg from qurtag.messages where id = p_message for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update qurtag.messages
  set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
      hidden_by = case when p_hidden then coalesce(hidden_by, v_me) end
  where id = p_message;
  perform qurtag.admin_log(v_me, case when p_hidden then 'hide_message' else 'unhide_message' end, 'message', p_message::text,
                           jsonb_build_object('thread_id', v_msg.thread_id, 'sender_kind', v_msg.sender_kind));
  return json_build_object('id', p_message, 'hidden', p_hidden);
end
$$;

-- Deletes an account and everything in it, after the admin types the account's email.
-- The typed email is checked here, not only on the screen. A super admin's own account
-- cannot be deleted this way.
create function qurtag.admin_delete_account(p_user uuid, p_confirm_email text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := qurtag.admin_check();
  v_user qurtag.auth_users%rowtype;
  v_items integer;
  v_threads integer;
begin
  select * into v_user from qurtag.auth_users where "id" = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select from qurtag.super_admins a where a.user_id = p_user) then
    raise exception 'cannot_delete_admin';
  end if;
  if p_confirm_email is null or lower(btrim(p_confirm_email)) <> lower(v_user."email") then
    raise exception 'confirmation_mismatch';
  end if;
  select count(*) into v_items from qurtag.items i join qurtag.households h on h.id = i.household_id
    where h.owner_user_id = p_user;
  select count(*) into v_threads from qurtag.threads th join qurtag.households h on h.id = th.household_id
    where h.owner_user_id = p_user;
  perform qurtag.admin_log(v_me, 'delete_account', 'account', p_user::text,
                           jsonb_build_object('email', v_user."email", 'items', v_items, 'conversations', v_threads));
  delete from qurtag.auth_users where "id" = p_user;
  return json_build_object('deleted', true);
end
$$;

-- 5. Owners and finders honour the two marks ------------------------------------------

-- An owner may switch a tag off or on; a replaced tag stays replaced, and a tag an admin
-- switched off stays off.
drop policy own_tags_update on qurtag.tags;
create policy own_tags_update on qurtag.tags for update to qurtag_user
  using (household_id in (select qurtag.my_household_ids()) and status <> 'replaced' and disabled_by_admin_at is null)
  with check (household_id in (select qurtag.my_household_ids()) and status in ('active', 'inactive'));

-- A hidden message is not in the owner's reads.
drop policy own_messages_read on qurtag.messages;
create policy own_messages_read on qurtag.messages for select to qurtag_user
  using (hidden_at is null
         and thread_id in (select t.id from qurtag.threads t where t.household_id in (select qurtag.my_household_ids())));

-- As in db/qurtag.sql, except that it refuses when an admin switched one of the item's
-- tags off (a new tag would get around that).
create or replace function qurtag.replace_tag(p_item_id uuid)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
  v_tag uuid;
  v_public text;
begin
  select i.household_id into v_household from qurtag.items i
  where i.id = p_item_id and i.household_id in (select qurtag.my_household_ids());
  if v_household is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select from qurtag.tags t where t.current_item_id = p_item_id and t.disabled_by_admin_at is not null) then
    raise exception 'tag_disabled' using errcode = '42501';
  end if;
  update qurtag.tags set status = 'replaced' where current_item_id = p_item_id and status = 'active';
  loop
    v_public := qurtag.new_public_id();
    exit when not exists (select from qurtag.tags t where t.public_id = v_public);
  end loop;
  insert into qurtag.tags (public_id, household_id, current_item_id)
  values (v_public, v_household, p_item_id)
  returning id into v_tag;
  return json_build_object('item_id', p_item_id, 'tag_id', v_tag, 'public_id', v_public);
end
$$;

-- As in db/qurtag.sql, except that hidden messages are left out of the finder's conversation.
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
                   else json_build_object('status', v_thread.status, 'messages', v_messages) end
  );
end
$$;

-- 6. Rights ------------------------------------------------------------------------------

-- A new function can be run by everyone until that is taken away (the schema-wide revoke in
-- db/qurtag.sql ran only once), so take it away from every new function, then give
-- the seven above to qurtag_user alone. admin_check and admin_log are called only from
-- inside the admin functions: no role runs them directly.
revoke all on function
  qurtag.is_super_admin(), qurtag.admin_overview(), qurtag.admin_list_accounts(text, integer, integer),
  qurtag.admin_account(uuid), qurtag.admin_set_tag(uuid, boolean), qurtag.admin_set_message_hidden(uuid, boolean),
  qurtag.admin_delete_account(uuid, text), qurtag.admin_check(), qurtag.admin_log(uuid, text, text, text, jsonb),
  qurtag.admin_audit_append_only()
  from public;
grant execute on function
  qurtag.is_super_admin(),
  qurtag.admin_overview(),
  qurtag.admin_list_accounts(text, integer, integer),
  qurtag.admin_account(uuid),
  qurtag.admin_set_tag(uuid, boolean),
  qurtag.admin_set_message_hidden(uuid, boolean),
  qurtag.admin_delete_account(uuid, text)
  to qurtag_user;

-- 7. Checks before finishing ---------------------------------------------------------------

do $$
declare
  bad text;
  fn text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'qurtag' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then raise exception 'row security is off on: %', bad; end if;

  -- No role the app uses has any right on the two new tables, or any policy on them.
  select string_agg(distinct g.grantee, ', ') into bad
  from information_schema.role_table_grants g
  where g.table_schema = 'qurtag' and g.table_name in ('super_admins', 'admin_audit')
    and g.grantee in ('qurtag_user', 'qurtag_anon', 'qurtag_auth', 'qurtag_authenticator', 'qurtag_server',
                      'public', 'anon', 'authenticated', 'service_role', 'authenticator');
  if bad is not null then raise exception 'a role has rights on the admin tables: %', bad; end if;
  if exists (select from pg_policies p where p.schemaname = 'qurtag' and p.tablename in ('super_admins', 'admin_audit')) then
    raise exception 'a policy exists on an admin table';
  end if;
  if exists (select from information_schema.column_privileges g
             where g.table_schema = 'qurtag' and g.table_name in ('super_admins', 'admin_audit')
               and g.grantee in ('qurtag_user', 'qurtag_anon', 'qurtag_auth', 'qurtag_authenticator', 'qurtag_server')) then
    raise exception 'a role has column rights on an admin table';
  end if;

  -- Only qurtag_user may run the admin functions, and no one else may run the two inner ones.
  foreach fn in array array['qurtag.is_super_admin()', 'qurtag.admin_overview()',
                            'qurtag.admin_list_accounts(text, integer, integer)', 'qurtag.admin_account(uuid)',
                            'qurtag.admin_set_tag(uuid, boolean)', 'qurtag.admin_set_message_hidden(uuid, boolean)',
                            'qurtag.admin_delete_account(uuid, text)'] loop
    if not has_function_privilege('qurtag_user', fn, 'EXECUTE') then raise exception 'qurtag_user cannot run %', fn; end if;
    if has_function_privilege('qurtag_anon', fn, 'EXECUTE') or has_function_privilege('qurtag_server', fn, 'EXECUTE')
       or has_function_privilege('qurtag_auth', fn, 'EXECUTE') or has_function_privilege('qurtag_authenticator', fn, 'EXECUTE') then
      raise exception 'a role that must not run % can', fn;
    end if;
  end loop;
  foreach fn in array array['qurtag.admin_check()', 'qurtag.admin_log(uuid, text, text, text, jsonb)'] loop
    if has_function_privilege('qurtag_user', fn, 'EXECUTE') or has_function_privilege('qurtag_anon', fn, 'EXECUTE')
       or has_function_privilege('qurtag_server', fn, 'EXECUTE') then
      raise exception 'a request role can run %', fn;
    end if;
  end loop;

  -- The finder token hash is still unreadable, and the new columns are not granted beyond
  -- what the owner already had (reads of messages stay row by row).
  if has_column_privilege('qurtag_user', 'qurtag.threads', 'finder_token_sha256', 'SELECT') then
    raise exception 'the owner role can read the finder token hash';
  end if;
  if has_column_privilege('qurtag_user', 'qurtag.tags', 'disabled_by_admin_at', 'UPDATE')
     or has_column_privilege('qurtag_user', 'qurtag.messages', 'hidden_at', 'UPDATE') then
    raise exception 'an owner can change an admin mark';
  end if;

  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'qurtag'
    and (p.roles && array['public', 'qurtag_anon', 'anon', 'authenticated']::name[]);
  if bad is not null then raise exception 'policy open to the public or to visitors with no pass: %', bad; end if;
end
$$;

reset check_function_bodies;

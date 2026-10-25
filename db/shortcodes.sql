-- QuR Tag: short codes. Applied after db/qurtag.sql (rollout step 1), as `postgres`, in one
-- transaction. It refuses to run twice. The rollout file
-- ~/Claude/Rollouts/QurTag-rollout-schema/10-short-codes.sql is this file plus a migration record.
--
-- What it adds
--   qurtag.tags.short_code   a code a person can read and type, printed beside the QR code and
--                            usable as an address (qurtag.com/k7m2p) that opens the tag's
--                            finder page. 5 or 6 characters from an alphabet without 0, o, 1, l
--                            and i (31 characters: a-z except i, l, o, and 2-9), always stored in
--                            lower case and unique, so the lookup ignores case. Every code holds
--                            at least one digit: that keeps a code from ever spelling a page of
--                            the site (terms, start) or an ordinary word. New codes are 6
--                            characters, about 887 million of them.
--   a trigger on tags        gives every new tag a code, so create_item and replace_tag need no
--                            change. A lock held until the end of the transaction keeps two tags
--                            made at once from drawing the same code.
--   every existing tag       gets a code in this file, replaced and switched-off ones too.
--   qurtag.short_code_tries  how many wrong guesses each visitor made in each minute. A visitor
--                            is a keyed hash made by the server (never a network address), and
--                            the key '*' counts everyone together. No role the app uses has any
--                            right on it.
--   server_short_code_lookup what the /<code> route calls as `qurtag_server` (which has no table
--                            rights): the public id of an active tag with an item, or null.
--                            Refuses with 'too_many' when a visitor has missed 20 times in the
--                            last 10 minutes, or everyone together 600 times in the last minute.
--                            Only wrong guesses count, so a real scan is never slowed by others'
--                            real scans, and a guesser is stopped before it learns anything.
--
-- Why a code is not a secret by itself: it opens the same finder page the QR code opens, which
-- shows only the item's name, photo and the owner's thank-you text and lets the finder write a
-- note. With 887 million possible codes, a guess hits a real tag about once in 100,000 tries at
-- 10,000 tags, and a visitor gets 20 wrong guesses per 10 minutes, so guessing codes in bulk does
-- not work.

set check_function_bodies = off;

do $$
begin
  if to_regclass('qurtag.tags') is null then
    raise exception 'apply db/qurtag.sql (rollout step 1) first';
  end if;
  if exists (select from information_schema.columns
             where table_schema = 'qurtag' and table_name = 'tags' and column_name = 'short_code') then
    raise exception 'short codes are already installed; nothing was changed';
  end if;
end
$$;

-- 1. The column ---------------------------------------------------------------------------------

alter table qurtag.tags add column short_code text;

-- 2. Making a code -------------------------------------------------------------------------------

-- 6 characters from the 31-character alphabet. Each character comes from one random byte; bytes
-- 248 to 255 are skipped so every character is equally likely (248 = 8 x 31). The version and
-- variant bytes of the UUIDs (6 and 8) are skipped too. A code with no digit, or one already in
-- use, is thrown away and drawn again.
create function qurtag.new_short_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea;
  out text;
  i int;
  v int;
begin
  loop
    out := '';
    while length(out) < 6 loop
      b := uuid_send(gen_random_uuid());
      for i in 0..15 loop
        continue when i in (6, 8);
        v := get_byte(b, i);
        continue when v >= 248;
        out := out || substr(alphabet, (v % 31) + 1, 1);
        exit when length(out) = 6;
      end loop;
    end loop;
    if out ~ '[2-9]' and not exists (select from qurtag.tags t where t.short_code = out) then
      return out;
    end if;
  end loop;
end
$$;

create function qurtag.tags_give_short_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.short_code is null then
    perform pg_advisory_xact_lock(hashtext('qurtag.short_code'));
    new.short_code := qurtag.new_short_code();
  end if;
  return new;
end
$$;

create trigger tags_before_insert_short_code before insert on qurtag.tags
  for each row execute function qurtag.tags_give_short_code();

-- 3. Existing tags ---------------------------------------------------------------------------------

do $$
declare
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('qurtag.short_code'));
  for r in select id from qurtag.tags where short_code is null order by created_at loop
    update qurtag.tags set short_code = qurtag.new_short_code() where id = r.id;
  end loop;
end
$$;

alter table qurtag.tags alter column short_code set not null;
alter table qurtag.tags add constraint tags_short_code_key unique (short_code);
alter table qurtag.tags add constraint tags_short_code_check
  check (short_code ~ '^[a-hj-km-np-z2-9]{5,6}$' and short_code ~ '[2-9]');

-- 4. The lookup and its limit ------------------------------------------------------------------

create table qurtag.short_code_tries (
  key text not null check (key = '*' or key ~ '^[0-9a-f]{64}$' or key = 'unknown'),
  minute timestamptz not null,
  misses integer not null default 0 check (misses >= 0),
  primary key (key, minute)
);
create index short_code_tries_minute_idx on qurtag.short_code_tries (minute);
alter table qurtag.short_code_tries enable row level security;

-- p_key: a keyed hash of the visitor made by the server (64 hex characters), or null.
create function qurtag.server_short_code_lookup(p_code text, p_key text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(p_key, 'unknown');
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_public text;
  v_minute timestamptz := date_trunc('minute', now());
begin
  if v_key <> 'unknown' and v_key !~ '^[0-9a-f]{64}$' then raise exception 'bad_key'; end if;
  if (select coalesce(sum(misses), 0) from qurtag.short_code_tries
      where key = v_key and minute > now() - interval '10 minutes') >= 20
     or (select coalesce(sum(misses), 0) from qurtag.short_code_tries
         where key = '*' and minute > now() - interval '1 minute') >= 600 then
    raise exception 'too_many';
  end if;
  if v_code ~ '^[a-hj-km-np-z2-9]{5,6}$' and v_code ~ '[2-9]' then
    select t.public_id into v_public from qurtag.tags t
    where t.short_code = v_code and t.status = 'active' and t.current_item_id is not null;
  end if;
  if v_public is null then
    insert into qurtag.short_code_tries (key, minute, misses) values (v_key, v_minute, 1)
      on conflict (key, minute) do update set misses = qurtag.short_code_tries.misses + 1;
    insert into qurtag.short_code_tries (key, minute, misses) values ('*', v_minute, 1)
      on conflict (key, minute) do update set misses = qurtag.short_code_tries.misses + 1;
    if random() < 0.02 then
      delete from qurtag.short_code_tries where minute < now() - interval '2 hours';
    end if;
  end if;
  return v_public;
end
$$;

-- A new function can be run by everyone until that is taken away: take it away from every new
-- function and from Supabase's own API roles, then give the lookup to the one login that uses it.
revoke all on function
  qurtag.new_short_code(), qurtag.tags_give_short_code(), qurtag.server_short_code_lookup(text, text)
  from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role', 'authenticator'] loop
    if api_role = 'public' or exists (select from pg_roles where rolname = api_role) then
      execute format('revoke all on qurtag.short_code_tries from %s', api_role);
      if api_role <> 'public' then
        execute format('revoke all on function qurtag.new_short_code(), qurtag.tags_give_short_code(), qurtag.server_short_code_lookup(text, text) from %s', api_role);
      end if;
    end if;
  end loop;
end
$$;

grant execute on function qurtag.server_short_code_lookup(text, text) to qurtag_server;

-- 5. Checks before finishing -----------------------------------------------------------------------

do $$
declare
  bad text;
  n int;
begin
  select string_agg(r.rolname, ', ') into bad
  from pg_roles r
  where r.rolname like 'qurtag\_%'
    and (has_table_privilege(r.oid, 'qurtag.short_code_tries', 'SELECT') or has_table_privilege(r.oid, 'qurtag.short_code_tries', 'INSERT')
         or has_table_privilege(r.oid, 'qurtag.short_code_tries', 'UPDATE') or has_table_privilege(r.oid, 'qurtag.short_code_tries', 'DELETE'));
  if bad is not null then raise exception 'a role has rights on qurtag.short_code_tries: %', bad; end if;
  if has_function_privilege('qurtag_user', 'qurtag.server_short_code_lookup(text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_anon', 'qurtag.server_short_code_lookup(text, text)', 'EXECUTE')
     or has_function_privilege('qurtag_user', 'qurtag.new_short_code()', 'EXECUTE')
     or has_function_privilege('qurtag_server', 'qurtag.new_short_code()', 'EXECUTE') then
    raise exception 'a role can call a function it must not';
  end if;
  select count(*) into n from qurtag.tags where short_code is null;
  if n > 0 then raise exception '% tags have no short code', n; end if;
end
$$;

reset check_function_bodies;

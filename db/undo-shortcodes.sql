-- Undo step 10: removes short codes (db/shortcodes.sql) and puts schema qurtag back as it was.
--
-- WHAT IT CANNOT UNDO: every tag's short code is deleted with its column. A code printed on a
-- tag stops working as an address (qurtag.com/<code> answers "not registered"); the QR code on
-- the same tag still works, because it holds the tag's full address. The record of wrong
-- guesses is deleted. Touches nothing outside schema qurtag but the migration record.
-- Refuses to run unless step 10 was run.
do $$
begin
  if not exists (select from information_schema.columns
                 where table_schema = 'qurtag' and table_name = 'tags' and column_name = 'short_code') then
    raise exception 'short codes are not installed; nothing was changed';
  end if;
end
$$;

drop function qurtag.server_short_code_lookup(text, text);
drop table qurtag.short_code_tries;
drop trigger tags_before_insert_short_code on qurtag.tags;
drop function qurtag.tags_give_short_code();
-- Dropping the column drops its unique key and its check with it.
alter table qurtag.tags drop column short_code;
drop function qurtag.new_short_code();

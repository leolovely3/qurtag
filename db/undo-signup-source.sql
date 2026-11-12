-- Undo db/signup-source.sql (rollout step 16). WHAT IT CANNOT UNDO: every account's recorded source (utm tags,
-- referring page, first page, channel) is deleted with the table. Nothing outside schema qurtag changes.
do $$
begin
  if to_regclass('qurtag.signup_sources') is null then
    raise exception 'the sign-up source is not installed; nothing was changed';
  end if;
end
$$;
drop function qurtag.record_signup_source(text, text, text, text, text, text, text, text);
drop table qurtag.signup_sources;

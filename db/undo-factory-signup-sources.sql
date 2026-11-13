-- Undo db/factory-signup-sources.sql (rollout step 17). Drops only the counting function; no data is lost and
-- the sign-up source table (step 16) is untouched.
do $$
begin
  if to_regprocedure('qurtag.factory_signup_sources(text, integer)') is null then
    raise exception 'the sign-up source reader is not installed; nothing was changed';
  end if;
end
$$;
drop function qurtag.factory_signup_sources(text, integer);

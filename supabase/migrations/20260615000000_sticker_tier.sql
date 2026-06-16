-- QurTag — add 'sticker' to hardware_tier enum
--
-- Stickers unlock the laptop / electronics / kids' gear / instrument use cases
-- that the luggage-focused premium tiers can't address. The schema needs to
-- accept the new tier; the marketing site does the rest.

alter table tags drop constraint if exists tags_hardware_tier_check;

alter table tags
  add constraint tags_hardware_tier_check
  check (hardware_tier in ('printable', 'sticker', 'core', 'pro', 'signature', 'track'));

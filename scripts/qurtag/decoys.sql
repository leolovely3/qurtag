-- Stand-ins for the shared project's other apps, for the local tests only.
--
-- The shared Supabase project holds other apps' schemas, each with its own logins, and
-- Supabase's own API roles with rights in schema public. These decoys copy that shape
-- (with rows) so the tests can prove that no QuR Tag role reaches any of it:
--   perklyy     an app like Perklyy: its own request role and login, a table with rows
--   wawe_vote   an app like the WAWE vote: its API login, a table with rows
--   yestonight  an app exposed through Supabase's API: rights for anon and authenticated
--   public      a table every Supabase API role can read, as some apps leave them
--   auth.users  Supabase Auth's user table (QuR Tag must never touch it)
--   net         pg_net's queue tables, which Supabase grants to PUBLIC (the one accepted
--               exception: every login can reach them)
-- Run as supabase_admin (the local stand-in for the platform) before db/qurtag.sql.

do $$
declare r text;
begin
  foreach r in array array['perklyy_staff', 'perklyy_anon', 'perklyy_authenticator', 'wawe_vote_api'] loop
    if not exists (select from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
end
$$;
grant perklyy_staff, perklyy_anon to perklyy_authenticator;

create schema if not exists perklyy;
create table if not exists perklyy.customers (id uuid primary key default gen_random_uuid(), email text, points int);
insert into perklyy.customers (email, points) values ('shopper@example.com', 120);
grant usage on schema perklyy to perklyy_staff, perklyy_anon;
grant select on perklyy.customers to perklyy_staff;

create schema if not exists wawe_vote;
create table if not exists wawe_vote.votes (id uuid primary key default gen_random_uuid(), title text);
insert into wawe_vote.votes (title) values ('Friday dinner');
grant usage on schema wawe_vote to wawe_vote_api;
grant select, insert on wawe_vote.votes to wawe_vote_api;

create schema if not exists yestonight;
create table if not exists yestonight.plans (id uuid primary key default gen_random_uuid(), note text);
insert into yestonight.plans (note) values ('a private plan');
grant usage on schema yestonight to anon, authenticated, service_role;
grant all on yestonight.plans to anon, authenticated, service_role;

create table if not exists public.app_secrets (id serial primary key, secret text);
insert into public.app_secrets (secret) values ('not for QuR Tag');
grant all on public.app_secrets to anon, authenticated, service_role;

create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
insert into auth.users (id, email) values (gen_random_uuid(), 'someone@example.com');

create extension if not exists pg_net;

-- An app like Apero in its own schema with its own request role, as in the shared project.
do $$
begin
  if not exists (select from pg_roles where rolname = 'tentables_user') then create role tentables_user nologin; end if;
end
$$;
create schema if not exists tentables;
create table if not exists tentables.user_profiles (id uuid primary key default gen_random_uuid(), email text);
insert into tentables.user_profiles (email) values ('diner@example.com');
grant usage on schema tentables to tentables_user;
grant select on tentables.user_profiles to tentables_user;

-- Performance check for crisis activation (roadmap S-03). LOCAL ONLY, manual.
--
-- Inside one transaction that is rolled back at the end, this adds 20,000 synthetic residents
-- within about 25 km of Kraków (on top of the seed), then activates a 20 km power outage as a
-- fake coordinator and reports the timing. Nothing is left behind.
--
-- Run against the local database (no local psql needed). It connects as supabase_admin,
-- the local superuser, because the postgres role may not load auto_explain:
--   docker exec -i supabase_db_10x-astro-starter psql -U supabase_admin -d postgres < scripts/perf-crisis.sql
--
-- Pass: `activate_crisis` under 1 s, and the nested plan shows `profiles_location_idx` (an
-- Index Scan or Bitmap Index Scan) driving the radius filter.

\timing on
\set ON_ERROR_STOP on

begin;

select setseed(0.17);

insert into auth.users (id, aud, role, email)
select md5('skillnet-perf-' || i)::uuid, 'authenticated', 'authenticated', 'perf-' || i || '@perf.skillnet.test'
from generate_series(1, 20000) as i;

insert into public.profiles (user_id, location_source, location)
select
  md5('skillnet-perf-' || i)::uuid,
  'pin',
  extensions.st_transform(
    extensions.st_setsrid(
      extensions.st_makepoint(
        567095.1 + 25000 * sqrt(r) * cos(t),
        243737.0 + 25000 * sqrt(r) * sin(t)
      ),
      2180
    ),
    4326
  )::extensions.geography
from (select i, random() as r, 2 * pi() * random() as t from generate_series(1, 20000) as i) as g;

insert into public.profile_skills (user_id, skill_slug, level)
select g.user_id, k.slug, case when k.has_level then 1 + floor(random() * 3)::smallint end
from (
  select md5('skillnet-perf-' || i)::uuid as user_id, i, 1 + floor(random() * 4)::integer as n
  from generate_series(1, 20000) as i
) as g
cross join lateral (
  select sk.slug, sk.has_level from public.skills sk order by random() + 0 * g.i, sk.slug limit g.n
) as k;

-- The fake coordinator.
insert into auth.users (id, aud, role, email)
values ('0e0e0e0e-0000-0000-0000-00000000c00d', 'authenticated', 'authenticated', 'coord@perf.skillnet.test');
insert into public.user_roles (user_id, role, granted_by)
values ('0e0e0e0e-0000-0000-0000-00000000c00d', 'coordinator', 'perf script');

-- Fresh statistics, as production would have them (rolled back with everything else).
analyze public.profiles;
analyze public.profile_skills;

select count(*) as profiles_total from public.profiles;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"0e0e0e0e-0000-0000-0000-00000000c00d","role":"authenticated"}',
  true
);

-- 1. Timing: the psql `Time:` line under this call is the number to record.
select public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 20) as timed_crisis;

reset role;

-- 2. Plan: a second activation, printing the plan of each statement inside activate_crisis
-- that takes over 5 ms (the ranking insert). Look for profiles_location_idx under the
-- `candidates` CTE. auto_explain adds overhead, so read the timing from step 1.
load 'auto_explain';
set auto_explain.log_min_duration = 5;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_nested_statements = on;
set client_min_messages = log;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"0e0e0e0e-0000-0000-0000-00000000c00d","role":"authenticated"}',
  true
);

select public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 20) as explained_crisis;

reset role;
set client_min_messages = notice;

select match_count from public.crises where activated_by = '0e0e0e0e-0000-0000-0000-00000000c00d';

rollback;

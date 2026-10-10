-- Skills-density snapshot guarantees (security audit F-08): calls within the hour read the stored
-- snapshot instead of scanning residents, a stale snapshot is refreshed by the next call, each
-- category refreshes on its own, and clients cannot reach the snapshot or the refresh directly.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

delete from public.profiles;
delete from public.skills_density_cells;
delete from public.skills_density_refreshes;

-- Six consenting electricians (category techniczne) in one 2 km square of Kraków.
insert into auth.users (id, email)
select ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'd' || i || '@test.local'
from generate_series(1, 6) as i;

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where u.email like 'd%@test.local'
  and not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from generate_series(1, 6) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'elektryk', 2
from generate_series(1, 6) as i;

create temp table calls (label text, n bigint, band smallint);
grant select, insert on calls to anon;

-- ---------------------------------------------------------------------------
-- First call computes, later calls read the snapshot (as anon)
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into calls select 'first', count(*), max(band) from public.get_skills_density();

reset role;

select is(
  (select array[n::integer, band::integer] from calls where label = 'first'),
  array[1, 1],
  'first_call: the first call computes one band-1 square'
);
select is(
  (select refreshed_at from public.skills_density_refreshes where category = ''),
  now(),
  'first_call: the all-skills snapshot is stamped'
);
select is(
  (select count(*) from public.skills_density_refreshes),
  1::bigint,
  'first_call: only the requested category is computed'
);

-- Four more residents join the square: 10 people would be band 2 on a live scan.
insert into auth.users (id, email)
select ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'd' || i || '@test.local'
from generate_series(7, 10) as i;
insert into public.consent_events (user_id, version, source)
select ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '2026-10-06', 'signup'
from generate_series(7, 10) as i
where not exists (
  select 1 from public.consent_events c
  where c.user_id = ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
);
insert into public.profiles (user_id, location_source, location)
select
  ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from generate_series(7, 10) as i;
insert into public.profile_skills (user_id, skill_slug, level)
select ('88888888-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'elektryk', 2
from generate_series(7, 10) as i;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into calls select 'within_hour', count(*), max(band) from public.get_skills_density();

reset role;

select is(
  (select band from calls where label = 'within_hour'),
  1::smallint,
  'within_hour: a call within the hour reads the snapshot, not the residents'
);

-- ---------------------------------------------------------------------------
-- A stale snapshot is refreshed by the next call
-- ---------------------------------------------------------------------------

update public.skills_density_refreshes set refreshed_at = now() - interval '61 minutes' where category = '';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into calls select 'stale', count(*), max(band) from public.get_skills_density();
insert into calls select 'techniczne', count(*), max(band) from public.get_skills_density('techniczne');
insert into calls select 'medyczne', count(*), max(band) from public.get_skills_density('medyczne');

select throws_ok(
  $$ select * from public.get_skills_density('nie-ma') $$,
  'P0001',
  'unknown_category',
  'unknown_category: an unknown category is still refused'
);

reset role;

select is(
  (select band from calls where label = 'stale'),
  2::smallint,
  'stale: a snapshot older than an hour is recomputed by the next call'
);
select is(
  (select refreshed_at from public.skills_density_refreshes where category = ''),
  now(),
  'stale: the refresh is stamped'
);
select is(
  (select band from calls where label = 'techniczne'),
  2::smallint,
  'categories: a category is computed on its first call'
);
select is(
  (select n from calls where label = 'medyczne'),
  0::bigint,
  'categories: a category with no residents has no squares'
);
select is(
  (select array_agg(category order by category) from public.skills_density_refreshes),
  array['', 'medyczne', 'techniczne'],
  'categories: each category has its own snapshot; an unknown one stores nothing'
);
select is(
  (select count(*) from public.skills_density_cells where category = ''),
  1::bigint,
  'stale: the refresh replaces the old squares instead of adding to them'
);

-- ---------------------------------------------------------------------------
-- Privileges and shape
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.skills_density_cells'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.skills_density_refreshes'::regclass),
  'privileges: RLS is enabled on both snapshot tables'
);
select ok(
  not has_table_privilege('anon', 'public.skills_density_cells', 'select')
  and not has_table_privilege('authenticated', 'public.skills_density_cells', 'select')
  and not has_table_privilege('anon', 'public.skills_density_refreshes', 'update')
  and not has_table_privilege('authenticated', 'public.skills_density_refreshes', 'delete'),
  'privileges: clients cannot read or write the snapshot tables'
);
select ok(
  not has_function_privilege('anon', 'public.refresh_skills_density(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.refresh_skills_density(text)', 'execute'),
  'privileges: clients cannot force a refresh'
);
select ok(
  has_function_privilege('anon', 'public.get_skills_density(text)', 'execute'),
  'privileges: the public map stays callable by anon'
);
select is(
  (select provolatile::text from pg_proc where oid = 'public.get_skills_density(text)'::regprocedure),
  'v',
  'shape: get_skills_density is volatile, so PostgREST runs it read-write'
);

select * from finish();
rollback;

-- Public skills-density guarantees: anon reads squares but never resident rows, only `cell` and
-- `band` leave the database, squares under 5 distinct residents are hidden, the band edges,
-- distinct-person counting per category, the fixed 2 km grid, eligibility, the category filter
-- and the square geometry.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed.
delete from public.profiles;

-- The 2 km square (EPSG:2180) that contains central Kraków. Fixture square k sits at
-- (base_x + k * 2000, base_y): even k are spaced apart, 20 and 21 are neighbours.
create temp table base as
select
  floor(extensions.st_x(g) / 2000) * 2000 as x,
  floor(extensions.st_y(g) / 2000) * 2000 as y
from (
  select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326), 2180) as g
) as k;

-- One row per fixture resident. `sub` picks the 500 m cell inside the square (0 or 2 along x).
create temp table people (
  user_id uuid primary key default gen_random_uuid(),
  sq integer not null,
  sub integer not null default 0,
  located boolean not null default true,
  skills text[] not null
);

insert into people (sq, sub, skills)
-- k threshold: 4 hidden, 5 shown (split across two 500 m cells: the grid test).
select 0, 0, array['elektryk'] from generate_series(1, 4)
union all select 2, 0, array['elektryk'] from generate_series(1, 3)
union all select 2, 2, array['elektryk'] from generate_series(1, 2)
-- Band edges.
union all select 4, 0, array['elektryk'] from generate_series(1, 9)
union all select 6, 0, array['elektryk'] from generate_series(1, 10)
union all select 8, 0, array['elektryk'] from generate_series(1, 24)
union all select 10, 0, array['elektryk'] from generate_series(1, 25)
-- Distinct residents: 4 + 1 with three medical skills is 5 people in medyczne.
union all select 12, 0, array['lekarz'] from generate_series(1, 4)
union all select 12, 0, array['lekarz', 'pielegniarka', 'psycholog']
-- 4 residents with 2 medical skills each: 8 skill rows, 4 people.
union all select 14, 0, array['lekarz', 'pielegniarka'] from generate_series(1, 4)
-- Category filter: 5 people with techniczne skills only.
union all select 16, 0, array['elektryk', 'informatyk'] from generate_series(1, 5)
-- Neighbouring squares with 3 each must not merge into 6.
union all select 20, 0, array['elektryk'] from generate_series(1, 3)
union all select 21, 0, array['elektryk'] from generate_series(1, 3);

-- Eligibility: in square 0, a located resident with no skills, and a resident with skills
-- but no location. Neither may lift the square to 5.
insert into people (sq, skills) values (0, array[]::text[]);
insert into people (sq, located, skills) values (0, false, array['elektryk']);

insert into auth.users (id, email)
select user_id, user_id || '@test.local' from people;

insert into public.profiles (user_id, location_source, location)
select
  p.user_id,
  'pin',
  extensions.st_transform(
    extensions.st_setsrid(extensions.st_makepoint(b.x + p.sq * 2000 + p.sub * 500 + 250, b.y + 250), 2180),
    4326
  )::extensions.geography
from people p cross join base b
where p.located;

insert into public.profiles (user_id) select user_id from people where not located;

insert into public.profile_skills (user_id, skill_slug, level)
select p.user_id, s, 2 from people p cross join unnest(p.skills) as s;

-- Nobody in the fixtures has a phone except one resident of square 2; the rest are still counted.
insert into public.profile_contacts (user_id, phone)
select user_id, '+48600000001' from people where sq = 2 limit 1;

-- ---------------------------------------------------------------------------
-- Access boundary and calls (as anon)
-- ---------------------------------------------------------------------------

create temp table res (cat text, cell jsonb, band smallint);
grant select, insert on res to anon;

select ok(
  has_function_privilege('anon', 'public.get_skills_density(text)', 'execute'),
  'anon_can_execute: anon has execute on get_skills_density'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into res select 'all', * from public.get_skills_density();
insert into res select 'medyczne', * from public.get_skills_density('medyczne');
insert into res select 'techniczne', * from public.get_skills_density('techniczne');

select is(
  (select count(*) from public.profiles),
  0::bigint,
  'anon_no_rows: anon still sees no profiles'
);
select is(
  (select count(*) from public.profile_skills),
  0::bigint,
  'anon_no_rows: anon still sees no profile_skills'
);

select throws_ok(
  $$ select * from public.get_skills_density('nie-ma') $$,
  'P0001',
  'unknown_category',
  'unknown_category: an unknown category is refused'
);

reset role;

-- The square index (along x, relative to base) of each returned cell.
create temp view res_sq as
select
  r.cat,
  r.cell,
  r.band,
  (floor(
    extensions.st_x(
      extensions.st_centroid(
        extensions.st_transform(extensions.st_setsrid(extensions.st_geomfromgeojson(r.cell::text), 4326), 2180)
      )
    ) / 2000
  ) * 2000 - b.x)::integer / 2000 as sq
from res r cross join base b;

create function pg_temp.band_of(p_cat text, p_sq integer) returns smallint
language sql as $$ select band from res_sq where cat = p_cat and sq = p_sq $$;

-- ---------------------------------------------------------------------------
-- Output shape
-- ---------------------------------------------------------------------------

select is(
  (
    select array_agg(a.attname::text order by a.attnum)
    from pg_proc pr, unnest(pr.proargnames, pr.proargmodes) with ordinality as a(attname, mode, attnum)
    where pr.oid = 'public.get_skills_density(text)'::regprocedure and a.mode = 't'
  ),
  array['cell', 'band'],
  'output_columns: only cell and band are returned'
);

select is(
  (select count(*) from res where cat = 'all'),
  7::bigint,
  'all_squares: exactly the 7 squares with 5 or more residents are returned'
);

-- ---------------------------------------------------------------------------
-- k threshold, grid and band edges
-- ---------------------------------------------------------------------------

select is(pg_temp.band_of('all', 0), null::smallint, 'k_threshold: 4 residents (+1 without skills, +1 without location) are hidden');
select is(pg_temp.band_of('all', 2), 1::smallint, 'k_threshold: 5 residents give band 1');
select is(
  (select count(*) from res_sq where cat = 'all' and sq = 2),
  1::bigint,
  'grid: two 500 m cells in one 2 km square come back as one square'
);
select is(pg_temp.band_of('all', 4), 1::smallint, 'band_edges: 9 residents give band 1');
select is(pg_temp.band_of('all', 6), 2::smallint, 'band_edges: 10 residents give band 2');
select is(pg_temp.band_of('all', 8), 2::smallint, 'band_edges: 24 residents give band 2');
select is(pg_temp.band_of('all', 10), 3::smallint, 'band_edges: 25 residents give band 3');
select is(pg_temp.band_of('all', 20), null::smallint, 'grid: neighbouring squares are not merged (left)');
select is(pg_temp.band_of('all', 21), null::smallint, 'grid: neighbouring squares are not merged (right)');

-- ---------------------------------------------------------------------------
-- Distinct residents and the category filter
-- ---------------------------------------------------------------------------

select is(pg_temp.band_of('medyczne', 12), 1::smallint, 'distinct: 4 + 1 resident with 3 medical skills is 5 people');
select is(pg_temp.band_of('all', 12), 1::smallint, 'distinct: the same square counts 5 people in all skills');
select is(pg_temp.band_of('medyczne', 14), null::smallint, 'distinct: 4 residents with 8 medical skill rows stay hidden');
select is(pg_temp.band_of('all', 14), null::smallint, 'distinct: 4 residents with 8 skill rows stay hidden in all skills');
select is(pg_temp.band_of('all', 16), 1::smallint, 'category: techniczne-only square appears in all skills');
select is(pg_temp.band_of('techniczne', 16), 1::smallint, 'category: techniczne-only square appears in techniczne');
select is(pg_temp.band_of('medyczne', 16), null::smallint, 'category: techniczne-only square is absent from medyczne');
select is(
  (select count(*) from res r where r.cat = 'medyczne'
     and not exists (select 1 from res a where a.cat = 'all' and a.cell = r.cell)),
  0::bigint,
  'category: no square appears in a category view without appearing in all skills'
);

-- ---------------------------------------------------------------------------
-- Geometry
-- ---------------------------------------------------------------------------

select is(
  (select cell ->> 'type' from res_sq where cat = 'all' and sq = 2),
  'Polygon',
  'geometry: the cell is a GeoJSON Polygon'
);

select ok(
  (
    select extensions.st_hausdorffdistance(
      extensions.st_transform(extensions.st_setsrid(extensions.st_geomfromgeojson(r.cell::text), 4326), 2180),
      extensions.st_makeenvelope(b.x + 4000, b.y, b.x + 6000, b.y + 2000, 2180)
    ) < 1
    from res_sq r cross join base b
    where r.cat = 'all' and r.sq = 2
  ),
  'geometry: square 2 is the expected 2 km envelope (within 1 m)'
);

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.get_skills_density(text)'::regprocedure),
  'postgres',
  'definer_owner: get_skills_density is owned by postgres'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_skills_density(text)'::regprocedure),
  'definer_owner: get_skills_density is security definer'
);

select * from finish();
rollback;

-- Density map k-anonymity guarantees (security audit F-03): only accounts at least 14 days old
-- with a confirmed email count, category views need 10 people, the noise is bounded, secret-keyed
-- and changes daily, and it never reveals a square whose true count is under k.
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

-- A fixed salt, so the squares the noise tests need can be found deterministically.
update public.skills_density_config set salt = decode(repeat('ab', 32), 'hex'), noise_amplitude = 0;

-- The 2 km square (EPSG:2180) of central Kraków. Fixture squares are offsets (dx, dy) from it.
create temp table base as
select
  floor(extensions.st_x(g) / 2000)::integer as sx,
  floor(extensions.st_y(g) / 2000)::integer as sy
from (
  select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326), 2180) as g
) as k;

-- Adds n residents with one skill to square (dx, dy), with a given account age and confirmation.
create function pg_temp.add_people(
  p_dx integer, p_dy integer, p_n integer, p_skill text, p_age interval, p_confirmed boolean
) returns void
language plpgsql as $$
declare
  v_ids uuid[];
begin
  select array_agg(gen_random_uuid()) into v_ids from generate_series(1, p_n);

  insert into auth.users (id, email, created_at, email_confirmed_at)
  select id, id || '@k.test.local', now() - p_age, case when p_confirmed then now() - p_age end
  from unnest(v_ids) as id;

  insert into public.consent_events (user_id, version, source)
  select id, '2026-10-06', 'signup' from unnest(v_ids) as id;

  insert into public.profiles (user_id, location_source, location)
  select
    id,
    'pin',
    extensions.st_transform(
      extensions.st_setsrid(
        extensions.st_makepoint((b.sx + p_dx) * 2000 + 250, (b.sy + p_dy) * 2000 + 250),
        2180
      ),
      4326
    )::extensions.geography
  from unnest(v_ids) as id cross join base b;

  insert into public.profile_skills (user_id, skill_slug, level)
  select id, p_skill, 2 from unnest(v_ids) as id;
end;
$$;

-- The band of square (dx, dy) in a view ('' for all skills), or null when it is hidden.
create function pg_temp.band_at(p_category text, p_dx integer, p_dy integer) returns smallint
language sql as $$
  select band
  from public.get_skills_density(nullif(p_category, '')) d
  cross join base b
  where floor(
          extensions.st_x(
            extensions.st_centroid(
              extensions.st_transform(extensions.st_setsrid(extensions.st_geomfromgeojson(d.cell::text), 4326), 2180)
            )
          ) / 2000
        )::integer = b.sx + p_dx
    and floor(
          extensions.st_y(
            extensions.st_centroid(
              extensions.st_transform(extensions.st_setsrid(extensions.st_geomfromgeojson(d.cell::text), 4326), 2180)
            )
          ) / 2000
        )::integer = b.sy + p_dy
$$;

-- The noise square (dx, dy) gets today in a view, at the configured amplitude.
create function pg_temp.noise_at(p_category text, p_dx integer, p_dy integer) returns integer
language sql as $$
  select public.density_noise(nullif(p_category, ''), b.sx + p_dx, b.sy + p_dy, (now() at time zone 'Europe/Warsaw')::date)
  from base b
$$;

-- ---------------------------------------------------------------------------
-- Eligibility (no noise)
-- ---------------------------------------------------------------------------

-- (0, 0): 5 eligible residents. (2, 0): 4 eligible + 1 account 3 days old + 1 unconfirmed.
select pg_temp.add_people(0, 0, 5, 'elektryk', interval '30 days', true);
select pg_temp.add_people(2, 0, 4, 'elektryk', interval '30 days', true);
select pg_temp.add_people(2, 0, 1, 'elektryk', interval '3 days', true);
select pg_temp.add_people(2, 0, 1, 'elektryk', interval '30 days', false);
-- (4, 0): 9 eligible residents with a techniczne skill.
select pg_temp.add_people(4, 0, 9, 'elektryk', interval '30 days', true);

select is(pg_temp.band_at('', 0, 0), 1::smallint, 'eligibility: 5 old, confirmed accounts show a square');
select is(
  pg_temp.band_at('', 2, 0),
  null::smallint,
  'eligibility: an account under 14 days old and an unconfirmed one do not count towards the 5'
);

delete from public.skills_density_refreshes;
select is(pg_temp.band_at('', 4, 0), 1::smallint, 'category_k: 9 people show in all skills, where k is 5');
select is(pg_temp.band_at('techniczne', 4, 0), null::smallint, 'category_k: the same 9 people stay hidden in a category, where k is 10');

-- ---------------------------------------------------------------------------
-- The noise
-- ---------------------------------------------------------------------------

update public.skills_density_config set noise_amplitude = 2;

create temp table noise_sample as
select dx, dy, pg_temp.noise_at('', dx, dy) as n
from generate_series(0, 19) as dx, generate_series(0, 19) as dy;

select is(
  (select array_agg(distinct n order by n) from noise_sample),
  array[-2, -1, 0, 1, 2],
  'noise: stays within ±2 and takes every value in that range'
);
select is(
  pg_temp.noise_at('', 3, 7),
  pg_temp.noise_at('', 3, 7),
  'noise: deterministic for one square on one day'
);
select ok(
  exists (
    select 1 from noise_sample s cross join base b
    where s.n <> public.density_noise(null, b.sx + s.dx, b.sy + s.dy, (now() at time zone 'Europe/Warsaw')::date + 1)
  ),
  'noise: changes from one day to the next'
);
select ok(
  exists (select 1 from noise_sample s where s.n <> pg_temp.noise_at('medyczne', s.dx, s.dy)),
  'noise: differs between views of the same square'
);

update public.skills_density_config set salt = decode(repeat('cd', 32), 'hex');
select ok(
  exists (select 1 from noise_sample s where s.n <> pg_temp.noise_at('', s.dx, s.dy)),
  'noise: depends on the secret salt, so the public code alone cannot recompute it'
);
update public.skills_density_config set salt = decode(repeat('ab', 32), 'hex');

-- ---------------------------------------------------------------------------
-- The floor: noise hides squares, never reveals one under k (amplitude 2, all skills)
-- ---------------------------------------------------------------------------

-- Squares from row dy = 5 upwards, clear of the eligibility fixtures, picked by their noise today.
create temp table picks as
select
  (select array[dx, dy] from noise_sample where dy >= 5 and n >= 1 order by dx, dy limit 1) as up,
  (select array[dx, dy] from noise_sample where dy >= 5 and n <= -1 order by dx, dy offset 1 limit 1) as down,
  (select array[dx, dy] from noise_sample where dy >= 5 and n >= 1 order by dx, dy offset 2 limit 1) as edge;

-- 4 people where the noise is positive: 4 + noise would reach 5, but the true count does not.
select pg_temp.add_people((select up[1] from picks), (select up[2] from picks), 4, 'elektryk', interval '30 days', true);
-- 5 people where the noise is negative: the true count reaches 5, the noisy one does not.
select pg_temp.add_people((select down[1] from picks), (select down[2] from picks), 5, 'elektryk', interval '30 days', true);
-- 9 people where the noise is positive: band 1 on the true count, band 2 on the noisy one.
select pg_temp.add_people((select edge[1] from picks), (select edge[2] from picks), 9, 'elektryk', interval '30 days', true);

delete from public.skills_density_refreshes;

select is(
  pg_temp.band_at('', (select up[1] from picks), (select up[2] from picks)),
  null::smallint,
  'floor: 4 people stay hidden even where the noise is positive'
);
select is(
  pg_temp.band_at('', (select down[1] from picks), (select down[2] from picks)),
  null::smallint,
  'noise_hides: 5 people can be hidden where the noise is negative'
);
select is(
  pg_temp.band_at('', (select edge[1] from picks), (select edge[2] from picks)),
  (case when 9 + pg_temp.noise_at('', (select edge[1] from picks), (select edge[2] from picks)) >= 10 then 2 else 1 end)::smallint,
  'band_edges: the band comes from the noisy count, so 9 people can read as 10 or more'
);

-- ---------------------------------------------------------------------------
-- Daily refresh and privileges
-- ---------------------------------------------------------------------------

update public.skills_density_refreshes set refreshed_at = now() where category = '';
select pg_temp.add_people(0, 2, 5, 'elektryk', interval '30 days', true);
select is(
  pg_temp.band_at('', 0, 2),
  null::smallint,
  'daily: a snapshot from earlier today is served, so new residents wait for tomorrow'
);

select ok(
  not has_table_privilege('anon', 'public.skills_density_config', 'select')
  and not has_table_privilege('authenticated', 'public.skills_density_config', 'select')
  and (select relrowsecurity from pg_class where oid = 'public.skills_density_config'::regclass),
  'privileges: the salt and the amplitude stay closed to clients'
);
select ok(
  not has_function_privilege('anon', 'public.density_noise(text, integer, integer, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.density_noise(text, integer, integer, date)', 'execute'),
  'privileges: clients cannot call density_noise'
);
select is(
  (select array[octet_length(salt), noise_amplitude] from public.skills_density_config),
  array[32, 2],
  'config: one row, a 32-byte salt and an amplitude of 2'
);

select * from finish();
rollback;

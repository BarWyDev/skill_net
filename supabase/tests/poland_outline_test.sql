-- Poland outline (QA-024) and the crisis place label (QA-026). The points match
-- src/lib/poland.test.ts. Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Every postcode centroid is inside, except 57-522, whose seeded centroid lies in Czechia
-- (a data error; postcode locations are never checked against the outline).
select is(
  (select count(*)::integer from public.postcodes
   where postcode <> '57-522'
     and not public.is_in_poland(extensions.st_y(centroid::extensions.geometry), extensions.st_x(centroid::extensions.geometry))),
  0,
  'every postcode centroid lies inside the outline'
);

select ok(
  (select bool_and(public.is_in_poland(lat, lng)) from (values
    (52.23, 21.01), (54.6, 18.8), (53.91, 14.24), (54.25, 23.19), (52.07, 23.62),
    (50.87, 24.14), (49.01, 22.86), (49.18, 20.088), (50.44, 16.24), (50.735, 15.74)
  ) as t (lat, lng)),
  'border areas in Poland are inside'
);

select ok(
  (select not bool_or(public.is_in_poland(lat, lng)) from (values
    (50.53, 14.79), (52.52, 13.4), (50.59, 16.33), (49.83, 18.29), (49.06, 20.3),
    (49.84, 24.03), (52.1, 23.7), (53.68, 23.83), (54.23, 23.52), (54.71, 20.51), (54.47, 19.94)
  ) as t (lat, lng)),
  'neighbouring countries are outside, also inside the old bounding box'
);

-- ---------------------------------------------------------------------------
-- Profile trigger
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000aaaa', 'coord-outline@test.local'),
  ('eeeeeeee-0000-0000-0000-00000000aaaa', 'resident-outline@test.local');

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-00000000aaaa', 'coordinator', 'test');

select throws_ok(
  $$insert into public.profiles (user_id, location_source, location)
    values ('eeeeeeee-0000-0000-0000-00000000aaaa', 'pin',
            extensions.st_setsrid(extensions.st_makepoint(14.79, 50.53), 4326)::extensions.geography)$$,
  'outside_poland',
  'a profile pin in Czechia inside the old bounding box is refused'
);

select lives_ok(
  $$insert into public.profiles (user_id, location_source, location)
    values ('eeeeeeee-0000-0000-0000-00000000aaaa', 'pin',
            extensions.st_setsrid(extensions.st_makepoint(19.94, 50.06), 4326)::extensions.geography)$$,
  'a profile pin in Kraków is accepted'
);

-- ---------------------------------------------------------------------------
-- activate_crisis
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-00000000aaaa", "role": "authenticated"}', true);

select throws_ok(
  $$select public.activate_crisis('awaria-pradu', 'pin', null, 50.53, 14.79, 5)$$,
  'outside_poland',
  'an epicentre in Czechia inside the old bounding box is refused'
);

select throws_ok(
  $$select public.activate_crisis('awaria-pradu', 'pin', null, 52.52, 13.4, 5)$$,
  'outside_poland',
  'an epicentre in Berlin is refused'
);

create temp table activated (label text, id uuid) on commit drop;
grant all on activated to authenticated;

insert into activated
select 'postcode', public.activate_crisis('awaria-pradu', 'postcode', '31-001', null, null, 5);

-- A pin on the 31-001 centroid: its nearest postcode is 31-001 itself.
insert into activated
select 'pin', public.activate_crisis(
  'awaria-pradu', 'pin', null,
  (select extensions.st_y(centroid::extensions.geometry) from public.postcodes where postcode = '31-001'),
  (select extensions.st_x(centroid::extensions.geometry) from public.postcodes where postcode = '31-001'),
  5
);

select is(
  (select epicentre_postcode from public.crises where id = (select id from activated where label = 'postcode')),
  '31-001',
  'a postcode epicentre stores the typed postcode'
);

select is(
  (select epicentre_postcode from public.crises where id = (select id from activated where label = 'pin')),
  '31-001',
  'a pinned epicentre stores the nearest postcode'
);

select ok(
  (select epicentre_postcode is not null from public.crises where id = (select id from activated where label = 'pin')),
  'the label is readable by the coordinator'
);

reset role;

select is(
  (select count(*)::integer from public.crises where epicentre_postcode is null),
  0,
  'every crisis has a place label'
);

select has_column('public', 'crises', 'epicentre_postcode', 'crises has epicentre_postcode');

select * from finish();
rollback;

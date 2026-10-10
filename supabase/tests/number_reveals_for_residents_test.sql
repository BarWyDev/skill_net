-- "Kto widział mój numer" guarantees (security audit F-11): a resident sees every reveal of their
-- own number with its date, crisis type and area, never the coordinator or the reason, and never
-- anyone else's reveals. Also the consent version this change publishes.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

delete from public.profiles;

-- K: a coordinator. A and B: residents with a phone. C: a resident without one. All in Kraków.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-0000000000f1', 'coord-f11@test.local'),
  ('99999999-0000-0000-0000-00000000000a', 'a-f11@test.local'),
  ('99999999-0000-0000-0000-00000000000b', 'b-f11@test.local'),
  ('99999999-0000-0000-0000-00000000000c', 'c-f11@test.local');

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-0000000000f1', 'coordinator', 'test');

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where u.email like '%-f11@test.local'
  and not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select u.id, 'pin', extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
from auth.users u
where u.email in ('a-f11@test.local', 'b-f11@test.local', 'c-f11@test.local');

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone) values
  ('99999999-0000-0000-0000-00000000000a', '+48600000011'),
  ('99999999-0000-0000-0000-00000000000b', '+48600000012');

create temp table crisis_ids (name text primary key, id uuid);
create temp table seen (who text, revealed_at timestamptz, crisis_type text, epicentre_postcode text);
grant select, insert on crisis_ids, seen to authenticated;

-- K activates a power outage and reveals its contacts twice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

insert into crisis_ids select 'outage', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1);
select count(*) from public.reveal_crisis_contacts(
  (select id from crisis_ids where name = 'outage'), 'Brak potwierdzeń od mieszkańców Kazimierza'
);
select count(*) from public.reveal_crisis_contacts(
  (select id from crisis_ids where name = 'outage'), 'Druga zmiana dyżurnych, ponowne sprawdzenie'
);

-- What each resident sees.
select set_config('request.jwt.claims', '{"sub":"99999999-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into seen select 'A', * from public.get_my_number_reveals();
select set_config('request.jwt.claims', '{"sub":"99999999-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into seen select 'B', * from public.get_my_number_reveals();
select set_config('request.jwt.claims', '{"sub":"99999999-0000-0000-0000-00000000000c","role":"authenticated"}', true);
insert into seen select 'C', * from public.get_my_number_reveals();

reset role;

-- ---------------------------------------------------------------------------
-- What a resident sees
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from seen where who = 'A'),
  2::bigint,
  'own_reveals: A sees both reveals of their number'
);
select is(
  (select array_agg(distinct crisis_type || ' / ' || epicentre_postcode) from seen where who = 'A'),
  (
    select array[t.name_pl || ' / ' || c.epicentre_postcode]
    from public.crises c join public.crisis_types t on t.slug = c.crisis_type_slug
    where c.id = (select id from crisis_ids where name = 'outage')
  ),
  'own_reveals: each row names the crisis type and its area'
);
select is(
  (select array_agg(revealed_at order by revealed_at desc) from seen where who = 'A'),
  (
    select array_agg(e.occurred_at order by e.occurred_at desc, e.id desc)
    from public.contact_reveal_events e
    where e.crisis_id = (select id from crisis_ids where name = 'outage')
  ),
  'own_reveals: the dates are the reveal times, newest first'
);
select is(
  (select count(*) from seen where who = 'B'),
  2::bigint,
  'own_reveals: B sees the same two reveals of their own number'
);
select is(
  (select count(*) from seen where who = 'C'),
  0::bigint,
  'no_phone: a resident whose number was never revealed sees nothing'
);

-- ---------------------------------------------------------------------------
-- What a resident never sees
-- ---------------------------------------------------------------------------

select is(
  (
    select array_agg(a.attname::text order by a.attnum)
    from pg_proc pr, unnest(pr.proargnames, pr.proargmodes) with ordinality as a(attname, mode, attnum)
    where pr.oid = 'public.get_my_number_reveals()'::regprocedure and a.mode = 't'
  ),
  array['revealed_at', 'crisis_type', 'epicentre_postcode'],
  'never_coordinator: only the date, the crisis type and the area leave the database'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_number_reveals()', 'execute')
  and has_function_privilege('authenticated', 'public.get_my_number_reveals()', 'execute'),
  'privileges: only signed-in users can call it'
);
select ok(
  not has_table_privilege('authenticated', 'public.contact_reveal_events', 'select')
  and not has_table_privilege('authenticated', 'public.contact_reveal_subjects', 'select'),
  'privileges: the reveal log itself stays closed to clients'
);
select ok(
  (select prosecdef and pg_get_userbyid(proowner) = 'postgres' from pg_proc
   where oid = 'public.get_my_number_reveals()'::regprocedure),
  'definer_owner: get_my_number_reveals is security definer, owned by postgres'
);

-- ---------------------------------------------------------------------------
-- Consent version
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.consent_versions where version in ('2026-10-06', '2026-10-10')),
  2::bigint,
  'consent: the new notice version is published and the old one stays valid'
);
select ok(
  public.profile_is_matchable('99999999-0000-0000-0000-00000000000a'),
  'consent: a resident who accepted only the old version stays matchable'
);

select * from finish();
rollback;

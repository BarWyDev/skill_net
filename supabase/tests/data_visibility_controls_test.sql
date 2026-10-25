-- Data visibility controls (S-12): the four switches default to on; V1 (map) removes a resident
-- from the density refresh but not from crises; V2 (per-skill crisis use) removes the skill from
-- new snapshots and scores, and a resident with every skill hidden leaves crises but stays on the
-- map; in an active crisis V2 hides the row from the list, the teams (even through a role skill
-- outside the crisis matrix), the reveal and the visible count, and restores it at the same
-- `position`; V3 (availability) nulls availability in all three readers; V4 (break-glass) keeps the
-- number out of the reveal and its subjects, keeps "has phone", and counts in
-- `reveal_declined_count`; `save_my_profile` keeps switches on null and the 7-argument named call.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- ---------------------------------------------------------------------------
-- Columns and defaults
-- ---------------------------------------------------------------------------

select col_not_null('public', 'profiles', 'show_on_map', 'columns: show_on_map is not null');
select col_default_is('public', 'profiles', 'show_on_map', 'true', 'columns: show_on_map defaults to true');
select col_default_is('public', 'profiles', 'show_availability_in_crisis', 'true', 'columns: show_availability_in_crisis defaults to true');
select col_default_is('public', 'profiles', 'allow_contact_reveal', 'true', 'columns: allow_contact_reveal defaults to true');
select col_default_is('public', 'profile_skills', 'use_in_crisis', 'true', 'columns: use_in_crisis defaults to true');

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from audit rows left by manual testing.
delete from public.profiles;
delete from public.contact_reveal_subjects;
delete from public.contact_reveal_events;

-- K: a coordinator. Residents 1–5 share one Kraków cell (one density square of exactly 5), all
-- with a phone, an electrician's skill and every availability slot declared.
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000001', 'coord@test.local');

insert into auth.users (id, email)
select ('dddddddd-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'r' || i || '@test.local'
from generate_series(1, 5) as i;

insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test');

insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

-- The columns are left out on purpose: new rows get the defaults.
insert into public.profiles (user_id, location_source, location, availability_slots)
select
  ('dddddddd-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography,
  268435455
from generate_series(1, 5) as i;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select user_id, '+48600000001' from public.profiles;

select ok(
  (select bool_and(show_on_map and show_availability_in_crisis and allow_contact_reveal) from public.profiles)
    and (select bool_and(use_in_crisis) from public.profile_skills),
  'defaults: new profile and skill rows have every switch on'
);

-- The map counts only aged, confirmed accounts and blurs counts with noise: age and confirm the
-- fixtures, and turn the noise off so counts are exact.
update auth.users
set created_at = least(created_at, now() - interval '30 days'),
    email_confirmed_at = coalesce(email_confirmed_at, now() - interval '30 days');
update public.skills_density_config set noise_amplitude = 0;

create temp table crisis_ids (name text primary key, id uuid);
create temp table ids (name text primary key, user_id uuid, pos integer);
create temp table profile_rows (name text primary key, body jsonb);
grant select, insert on crisis_ids, ids, profile_rows to authenticated;

create function pg_temp.as_user(p_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user_id), true)
$$;

-- The density map as anon, recomputed now (the snapshot is marked stale first).
create function pg_temp.density_squares() returns bigint
language plpgsql as $$
declare
  v_n bigint;
begin
  delete from public.skills_density_refreshes;
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_n from public.get_skills_density();
  reset role;
  return v_n;
end;
$$;

-- Activates an awaria-pradu crisis over the Kraków cell as K. Earlier test crises are moved out of
-- the rolling hour first, so the activation throttle never trips.
create function pg_temp.activate(p_name text) returns void
language plpgsql as $$
begin
  update public.crises set activated_at = activated_at - interval '2 hours';
  set local role authenticated;
  perform pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
  insert into crisis_ids
  select p_name, public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 1, 'Testowa aktywacja kryzysu');
  reset role;
end;
$$;

create function pg_temp.crisis(p_name text) returns uuid
language sql as $$ select id from crisis_ids where name = p_name $$;

select is(pg_temp.density_squares(), 1::bigint, 'density: the square of 5 is shown with every switch on');

-- ---------------------------------------------------------------------------
-- V1: map contribution
-- ---------------------------------------------------------------------------

update public.profiles set show_on_map = false where user_id = 'dddddddd-0000-0000-0000-000000000001';

select ok(
  not public.profile_counts_on_map('dddddddd-0000-0000-0000-000000000001'),
  'v1: a resident with the map switch off does not count on the map'
);
select ok(
  public.profile_is_matchable('dddddddd-0000-0000-0000-000000000001'),
  'v1: the map switch does not touch crisis eligibility'
);
select is(pg_temp.density_squares(), 0::bigint, 'v1: the square drops below k when one resident leaves the map');

select pg_temp.activate('v1');

select is((select match_count from public.crises where id = pg_temp.crisis('v1')), 5, 'v1: the resident still enters a new crisis');

update public.profiles set show_on_map = true where user_id = 'dddddddd-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- V2: every skill hidden from crises
-- ---------------------------------------------------------------------------

update public.profile_skills set use_in_crisis = false where user_id = 'dddddddd-0000-0000-0000-000000000002';

select ok(
  not public.profile_is_matchable('dddddddd-0000-0000-0000-000000000002'),
  'v2_all: a resident with every skill hidden is not matchable'
);
select ok(
  public.profile_counts_on_map('dddddddd-0000-0000-0000-000000000002'),
  'v2_all: the resident still counts on the map'
);
select is(pg_temp.density_squares(), 1::bigint, 'v2_all: the square of 5 is still shown (D5)');

set local role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002');
insert into profile_rows select 'all_hidden', public.get_my_profile();
reset role;

select is((select body ->> 'complete' from profile_rows where name = 'all_hidden'), 'true', 'v2_all: get_my_profile complete stays true');
select is((select body ->> 'matchable' from profile_rows where name = 'all_hidden'), 'false', 'v2_all: get_my_profile matchable is false');
select is(
  (select body -> 'skills' -> 0 ->> 'crisis' from profile_rows where name = 'all_hidden'),
  'false',
  'v2_all: get_my_profile returns crisis = false on the hidden skill'
);

select pg_temp.activate('v2_all');

select is((select match_count from public.crises where id = pg_temp.crisis('v2_all')), 4, 'v2_all: the resident is not a candidate in a new crisis');

update public.profile_skills set use_in_crisis = true where user_id = 'dddddddd-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- V2: one skill hidden from crises
-- ---------------------------------------------------------------------------

-- Resident 3 also has a priority generator, hidden from crises. Without the hide their second
-- skill would add a breadth bonus over resident 4, who has only the electrician's skill.
insert into public.profile_skills (user_id, skill_slug, level, use_in_crisis)
values ('dddddddd-0000-0000-0000-000000000003', 'agregat-pradotworczy', null, false);

select pg_temp.activate('v2_one');

select is(
  (select matched_skills from public.crisis_matches
   where crisis_id = pg_temp.crisis('v2_one') and user_id = 'dddddddd-0000-0000-0000-000000000003'),
  '[{"slug":"elektryk","tier":"priority","level":2}]'::jsonb,
  'v2_one: the hidden skill is not in the new snapshot'
);
select is(
  (select score from public.crisis_matches
   where crisis_id = pg_temp.crisis('v2_one') and user_id = 'dddddddd-0000-0000-0000-000000000003'),
  (select score from public.crisis_matches
   where crisis_id = pg_temp.crisis('v2_one') and user_id = 'dddddddd-0000-0000-0000-000000000004'),
  'v2_one: the hidden skill does not raise the score'
);

delete from public.profile_skills
where user_id = 'dddddddd-0000-0000-0000-000000000003' and skill_slug = 'agregat-pradotworczy';

select is(
  public.crisis_visible_skills(
    'dddddddd-0000-0000-0000-000000000003',
    '[{"slug":"agregat-pradotworczy","tier":"priority","level":3},{"slug":"elektryk","tier":"priority","level":2}]'::jsonb
  ),
  '[{"slug":"elektryk","tier":"priority","level":2}]'::jsonb,
  'crisis_visible_skills: a skill no longer on the profile is dropped, the rest keep their order'
);

-- ---------------------------------------------------------------------------
-- An active crisis
-- ---------------------------------------------------------------------------

select pg_temp.activate('live');

-- By live-crisis position. A (1) hides their crisis skill, but keeps hand tools, a "techniczny"
-- role skill outside the awaria-pradu matrix. B (2) declines an emergency reveal. C (3) hides
-- their availability. O (4) is an ordinary resident who later saves their profile.
insert into ids
select v.name, m.user_id, m.position
from public.crisis_matches m
join (values ('A', 1), ('B', 2), ('C', 3), ('O', 4)) as v(name, pos) on v.pos = m.position
where m.crisis_id = pg_temp.crisis('live');

select is((select match_count from public.crises where id = pg_temp.crisis('live')), 5, 'fixtures: the live crisis holds all 5 residents');

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'narzedzia-reczne', null from ids where name = 'A';

-- Each resident changes their own rows, as the owner.
set local role authenticated;
select pg_temp.as_user((select user_id from ids where name = 'A'));
update public.profile_skills set use_in_crisis = false
where user_id = (select user_id from ids where name = 'A') and skill_slug = 'elektryk';
select pg_temp.as_user((select user_id from ids where name = 'B'));
update public.profiles set allow_contact_reveal = false where user_id = (select user_id from ids where name = 'B');
select pg_temp.as_user((select user_id from ids where name = 'C'));
update public.profiles set show_availability_in_crisis = false where user_id = (select user_id from ids where name = 'C');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

create temp table list_rows as select * from public.get_crisis_matches(pg_temp.crisis('live'));
create temp table team_rows as select * from public.get_team_candidates(pg_temp.crisis('live'), 'techniczny', 1);

select is((select count(*) from list_rows), 4::bigint, 'v2_live: the list drops the resident whose matched skill is hidden');
select is((select count(*) from list_rows where "position" = 1), 0::bigint, 'v2_live: position 1 (A) is absent from the list');
select is((select count(*) from team_rows where "position" = 1), 0::bigint, 'v2_live: A is not a team candidate, even through the hand-tools role');
select ok((select bool_and(not role_skills ? 'narzedzia') from team_rows), 'v2_live: nobody fills the hand-tools role');
select is(
  (select public.visible_match_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  4,
  'v2_live: visible_match_count excludes A'
);

select ok(
  (select has_phone from list_rows where "position" = 2),
  'v4: the list still shows that B has a phone'
);
select is(
  (select public.reveal_declined_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  1,
  'v4: reveal_declined_count counts B'
);

select ok(
  (select availability_slots is null and available_now is null from list_rows where "position" = 3),
  'v3: the list returns no availability for C'
);
select ok(
  (select availability_slots is null and available_now is null from team_rows where "position" = 3),
  'v3: the teams return no availability for C'
);
select ok(
  (select availability_slots = 268435455 and available_now from list_rows where "position" = 4),
  'v3: others keep their availability'
);

create temp table reveal_rows as
select * from public.reveal_crisis_contacts(pg_temp.crisis('live'), 'Brak potwierdzeń w nocy');

select is((select count(*) from reveal_rows), 3::bigint, 'reveal: 5 matched - A hidden - B declined');
select is((select count(*) from reveal_rows where "position" in (1, 2)), 0::bigint, 'reveal: neither A''s nor B''s number is shown');
select ok(
  (select availability_slots is null and available_now is null from reveal_rows where "position" = 3),
  'v3: the reveal returns no availability for C'
);

reset role;

select is(
  (select returned_count from public.crisis_list_views
   where crisis_id = pg_temp.crisis('live') and list = 'matches' order by id desc limit 1),
  4,
  'v2_live: the logged list count is the filtered count'
);
select is(
  (select revealed_count from public.contact_reveal_events where crisis_id = pg_temp.crisis('live')),
  3,
  'reveal: revealed_count excludes A and B'
);
select is(
  (select count(*) from public.contact_reveal_subjects s
   join public.contact_reveal_events e on e.id = s.event_id
   where e.crisis_id = pg_temp.crisis('live')
     and s.user_id in (select user_id from ids where name in ('A', 'B'))),
  0::bigint,
  'reveal: neither A nor B is logged as a subject'
);
select is(
  (select count(*) from public.contact_reveal_subjects s
   join public.contact_reveal_events e on e.id = s.event_id
   where e.crisis_id = pg_temp.crisis('live')),
  3::bigint,
  'reveal: the logged subjects equal the shown rows'
);

-- A shows the skill again; B turns the reveal back on.
update public.profile_skills set use_in_crisis = true where user_id = (select user_id from ids where name = 'A');
update public.profiles set allow_contact_reveal = true where user_id = (select user_id from ids where name = 'B');

set local role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');

select is(
  (select count(*) from public.get_crisis_matches(pg_temp.crisis('live')) where "position" = 1),
  1::bigint,
  'v2_live: A is back at position 1 once the skill is shown again'
);
select is(
  (select public.visible_match_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  5,
  'v2_live: visible_match_count is 5 again'
);
select is(
  (select public.reveal_declined_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  0,
  'v4: reveal_declined_count is 0 once B allows the reveal'
);
select ok(
  (select role_skills ? 'narzedzia' from public.get_team_candidates(pg_temp.crisis('live'), 'techniczny', 1)
   where "position" = 1),
  'v2_live: A is a team candidate again, through the hand-tools role'
);
select is(
  (select count(*) from public.reveal_crisis_contacts(pg_temp.crisis('live'), 'Brak potwierdzeń w nocy')
   where "position" in (1, 2)),
  2::bigint,
  'reveal: A''s and B''s numbers are shown again'
);

-- ---------------------------------------------------------------------------
-- reveal_declined_count access
-- ---------------------------------------------------------------------------

reset role;
update public.profiles set allow_contact_reveal = false where user_id = (select user_id from ids where name = 'B');

-- Also declined, but not counted: A hides their matched skill again, C has no phone, and the
-- resident at position 5 is paused.
insert into ids
select 'E', m.user_id, m.position from public.crisis_matches m
where m.crisis_id = pg_temp.crisis('live') and m.position = 5;
update public.profile_skills set use_in_crisis = false
where user_id = (select user_id from ids where name = 'A') and skill_slug = 'elektryk';
update public.profiles set allow_contact_reveal = false
where user_id in (select user_id from ids where name in ('A', 'C', 'E'));
delete from public.profile_contacts where user_id = (select user_id from ids where name = 'C');
update public.profiles
set paused_at = now(), paused_until = (now() at time zone 'Europe/Warsaw')::date + 30
where user_id = (select user_id from ids where name = 'E');

set local role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select is(
  (select public.reveal_declined_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  1,
  'reveal_declined_count: only B counts, not a hidden, phoneless or paused resident who declined'
);
reset role;

create temp table crisis_rows as select * from public.crises;
grant select on crisis_rows to authenticated;

set local role authenticated;
select pg_temp.as_user((select user_id from ids where name = 'O'));

select is(
  (select public.reveal_declined_count(row(t.*)::public.crises) from crisis_rows t where t.id = pg_temp.crisis('live')),
  0,
  'reveal_declined_count: a non-coordinator gets 0'
);

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select public.end_crisis(pg_temp.crisis('live'));

select is(
  (select public.reveal_declined_count(c) from public.crises c where c.id = pg_temp.crisis('live')),
  0,
  'reveal_declined_count: an ended crisis gets 0'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.reveal_declined_count(public.crises)', 'execute')
    and not has_function_privilege('anon', 'public.crisis_visible_skills(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.profile_counts_on_map(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.crisis_visible_skills(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.profile_counts_on_map(uuid)', 'execute'),
  'privileges: anon cannot read reveal_declined_count; the helpers are internal'
);
select ok(
  (select prosecdef and pg_get_userbyid(proowner) = 'postgres' from pg_proc
   where oid = 'public.reveal_declined_count(public.crises)'::regprocedure),
  'definer_owner: reveal_declined_count is security definer, owned by postgres'
);

-- ---------------------------------------------------------------------------
-- save_my_profile and get_my_profile (as O, the owner)
-- ---------------------------------------------------------------------------

update public.profiles
set show_on_map = false, show_availability_in_crisis = false, allow_contact_reveal = false
where user_id = (select user_id from ids where name = 'O');

set local role authenticated;
select pg_temp.as_user((select user_id from ids where name = 'O'));

-- The call the code on `master` makes: seven named arguments, no `crisis` keys.
select lives_ok(
  $$ select public.save_my_profile(
       p_location_source => 'pin',
       p_postcode => null,
       p_lat => 50.0614,
       p_lng => 19.9366,
       p_skills => '[{"slug":"elektryk","level":2}]'::jsonb,
       p_phone => '+48600000002',
       p_availability_slots => 0
     ) $$,
  'save_legacy: the 7-argument named call still succeeds'
);

insert into profile_rows select 'legacy', public.get_my_profile();

select is(
  (select jsonb_build_object(
     'map', body -> 'show_on_map',
     'availability', body -> 'show_availability_in_crisis',
     'reveal', body -> 'allow_contact_reveal'
   ) from profile_rows where name = 'legacy'),
  '{"map":false,"availability":false,"reveal":false}'::jsonb,
  'save_legacy: switches left out are unchanged'
);
select is(
  (select body -> 'skills' from profile_rows where name = 'legacy'),
  '[{"slug":"elektryk","level":2,"crisis":true}]'::jsonb,
  'save_legacy: a skill with no crisis key is used in crises'
);

select lives_ok(
  $$ select public.save_my_profile(
       p_location_source => 'pin',
       p_postcode => null,
       p_lat => 50.0614,
       p_lng => 19.9366,
       p_skills => '[{"slug":"elektryk","level":2,"crisis":false},{"slug":"kierowca-kat-b","level":1,"crisis":true}]'::jsonb,
       p_phone => '+48600000002',
       p_availability_slots => 0,
       p_show_on_map => true,
       p_show_availability_in_crisis => true,
       p_allow_contact_reveal => false
     ) $$,
  'save_switches: the 10-argument call succeeds'
);

insert into profile_rows select 'switches', public.get_my_profile();

select is(
  (select jsonb_build_object(
     'map', body -> 'show_on_map',
     'availability', body -> 'show_availability_in_crisis',
     'reveal', body -> 'allow_contact_reveal'
   ) from profile_rows where name = 'switches'),
  '{"map":true,"availability":true,"reveal":false}'::jsonb,
  'save_switches: sent switches are stored'
);
select is(
  (select body -> 'skills' from profile_rows where name = 'switches'),
  '[{"slug":"elektryk","level":2,"crisis":false},{"slug":"kierowca-kat-b","level":1,"crisis":true}]'::jsonb,
  'save_switches: per-skill crisis use is stored and returned, with the level kept'
);
select is((select body ->> 'matchable' from profile_rows where name = 'switches'), 'true', 'save_switches: one crisis skill left keeps the profile matchable');

reset role;

select ok(
  not exists (
    select 1 from pg_proc
    where proname = 'save_my_profile' and pronamespace = 'public'::regnamespace and pronargs <> 10
  ),
  'save_signature: only the 10-argument save_my_profile exists'
);

select * from finish();
rollback;

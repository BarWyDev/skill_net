-- Neighbour courses guarantees (roadmap S-17): no client privileges on the tables or helpers, the
-- course text rules, eligibility (location settled for 7 days, account age, confirmation, consent),
-- the 3-course limit, the visibility rule (3×3 block, k = 5 square, pause, expiry, closing, the
-- organiser's skill and move), sign-ups (capacity, hourly limit, withdraw), meeting details only
-- for active sign-ups, the server-owned location timestamp, and the lifecycle (a profile save keeps
-- courses, erasure removes them).
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(74);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

delete from public.profiles;
delete from public.skills_density_cells;
delete from public.skills_density_refreshes;
update public.skills_density_config set noise_amplitude = 0;

-- The 2 km square (EPSG:2180) of central Kraków. Fixture squares are offsets (dx, dy) from it.
create temp table base as
select
  floor(extensions.st_x(g) / 2000)::integer as sx,
  floor(extensions.st_y(g) / 2000)::integer as sy
from (
  select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326), 2180) as g
) as k;

create temp table ids (name text primary key, user_id uuid not null);
create temp table course_ids (name text primary key, id uuid not null);
create temp table bulk (id uuid primary key);
grant select on ids, bulk to authenticated;
grant select, insert on course_ids to authenticated;

-- Adds a resident with one skill in square (dx, dy). Defaults: 30 days old, confirmed, consented,
-- located, location set before tracking (null location_changed_at).
create function pg_temp.person(
  p_name text,
  p_dx integer,
  p_dy integer,
  p_age interval default '30 days',
  p_confirmed boolean default true,
  p_consent boolean default true,
  p_moved interval default null,
  p_located boolean default true
) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, created_at, email_confirmed_at)
  values (v_id, v_id || '@courses.test.local', now() - p_age, case when p_confirmed then now() - p_age end);

  if p_consent then
    insert into public.consent_events (user_id, version, source) values (v_id, '2026-10-06', 'signup');
  end if;

  insert into public.profiles (user_id, location_source, location, location_changed_at)
  select
    v_id,
    case when p_located then 'pin' end,
    case when p_located then
      extensions.st_transform(
        extensions.st_setsrid(
          extensions.st_makepoint((b.sx + p_dx) * 2000 + 250, (b.sy + p_dy) * 2000 + 250),
          2180
        ),
        4326
      )::extensions.geography
    end,
    case when p_moved is not null then now() - p_moved end
  from base b;

  insert into public.profile_skills (user_id, skill_slug, level) values (v_id, 'pierwsza-pomoc', 2);

  if p_name is not null then
    insert into ids (name, user_id) values (p_name, v_id);
  end if;

  return v_id;
end;
$$;

create function pg_temp.crowd(p_dx integer, p_dy integer, p_n integer) returns void
language sql as $$
  select pg_temp.person(null, p_dx, p_dy) from generate_series(1, p_n)
$$;

create function pg_temp.uid(p_name text) returns uuid
language sql as $$
  select user_id from ids where name = p_name
$$;

create function pg_temp.cid(p_name text) returns uuid
language sql as $$
  select id from course_ids where name = p_name
$$;

create function pg_temp.as_user(p_name text) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', (select user_id from ids where name = p_name)),
    true
  )
$$;

-- Square (0, 0): A organises; S views from the same square. Five map-eligible residents with the
-- crowd. N, U and X live there too but do not count (too new, unconfirmed, no consent).
select pg_temp.person('A', 0, 0);
select pg_temp.person('S', 0, 0);
select pg_temp.crowd(0, 0, 3);
select pg_temp.person('N', 0, 0, p_age => '3 days');
select pg_temp.person('U', 0, 0, p_confirmed => false);
select pg_temp.person('X', 0, 0, p_consent => false);
select pg_temp.person('L', 0, 0, p_located => false);
-- Square (1, 1), diagonal to A: B views. (0, 1), next to A: E views. (1, 0): M moved 6 days ago.
select pg_temp.person('B', 1, 1);
select pg_temp.crowd(1, 1, 4);
select pg_temp.person('E', 0, 1);
select pg_temp.person('M', 1, 0, p_moved => '6 days');
-- Square (2, 0), two squares from A: C views.
select pg_temp.person('C', 2, 0);
-- Square (5, 5): D organises with only 3 neighbours, under k = 5. V views next to it.
select pg_temp.person('D', 5, 5);
select pg_temp.crowd(5, 5, 3);
select pg_temp.person('V', 4, 5);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) as r(role)
    cross join unnest(array['public.courses', 'public.course_signups']) as t(tbl)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
    where has_table_privilege(r.role, t.tbl, p.priv)
  ),
  'no_client_table_privileges: anon and authenticated hold nothing on courses or course_signups'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.create_course(text, text, text, integer, integer, text)',
      'public.update_course(uuid, text, text, integer, integer, text)',
      'public.set_course_open(uuid, boolean)',
      'public.renew_course(uuid)',
      'public.delete_course(uuid)',
      'public.get_my_courses()',
      'public.get_course_area()',
      'public.get_nearby_courses()',
      'public.sign_up_for_course(uuid)',
      'public.withdraw_from_course(uuid)',
      'public.get_my_course_signups()'
    ]) as f(fn)
    where has_function_privilege('anon', f.fn, 'execute')
       or not has_function_privilege('authenticated', f.fn, 'execute')
  ),
  'rpcs_authenticated_only: every course RPC executes for authenticated and never for anon'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.check_course_text(text, integer, integer, text)',
      'public.density_square(extensions.geography)',
      'public.density_block_geojson(integer, integer, integer)',
      'public.ensure_skills_density_fresh(text)',
      'public.course_resident_eligible(uuid)',
      'public.course_eligible_on(uuid)',
      'public.course_hidden_reason(public.courses)',
      'public.course_visible_to(public.courses, uuid)',
      'public.course_active_signups(uuid)',
      'public.course_open_count(uuid)'
    ]) as f(fn)
    cross join unnest(array['anon', 'authenticated']) as r(role)
    where has_function_privilege(r.role, f.fn, 'execute')
  ),
  'helpers_not_executable_by_clients: no client can execute a course helper'
);

-- ---------------------------------------------------------------------------
-- Text rules
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.check_course_text('Kurs, zadzwoń 600 100 200', 0, 500, 'meeting') $$,
  'P0001', 'meeting_contact', 'text_rejects_phone: spaced number'
);
select throws_ok(
  $$ select public.check_course_text('Kurs, numer 600-100-200', 0, 500, 'meeting') $$,
  'P0001', 'meeting_contact', 'text_rejects_phone: dashed number'
);
select throws_ok(
  $$ select public.check_course_text('Kurs, numer +48600100200', 0, 500, 'meeting') $$,
  'P0001', 'meeting_contact', 'text_rejects_phone: +48 number'
);
select throws_ok(
  $$ select public.check_course_text('Kurs, numer (+48) 600 100 200', 0, 500, 'meeting') $$,
  'P0001', 'meeting_contact', 'text_rejects_phone: bracketed prefix'
);
select throws_ok(
  E'select public.check_course_text(''numer 600​100​200'', 0, 500, ''meeting'')',
  'P0001', 'meeting_contact', 'text_rejects_phone: zero-width characters inside the number'
);
select ok(
  public.check_course_text('sobota 21.10.2026, 10:00-12:00', 0, 500, 'meeting') is not null
    and public.check_course_text('2 x 90 min, 10-12 osób', 0, 500, 'meeting') is not null,
  'text_allows_dates_and_times: dates, times and short counts pass'
);
select throws_ok(
  $$ select public.check_course_text('Napisz na jan.kowalski@example.com', 20, 1000, 'description') $$,
  'P0001', 'description_contact', 'text_rejects_email'
);
select is(
  public.check_course_text(E'  Kurs​  pierwszej\tpomocy ', 5, 80, 'title'),
  'Kurs pierwszej pomocy',
  'text_normalises_whitespace: runs of spaces and invisible characters become one space'
);
select throws_ok(
  $$ select public.check_course_text('Kurs', 5, 80, 'title') $$,
  'P0001', 'title_invalid', 'text_bounds: a title under 5 characters is refused'
);
select is(
  public.check_course_text('   ', 0, 500, 'meeting'),
  null::text,
  'text_optional_empty: empty meeting details are null'
);

-- ---------------------------------------------------------------------------
-- Creation
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.as_user('A');
select throws_ok(
  $$ select public.create_course('lekarz', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_skill_not_held', 'create_requires_held_skill'
);

select pg_temp.as_user('L');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_no_location', 'create_requires_eligibility: no location'
);
select pg_temp.as_user('M');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_recent_move', 'create_requires_eligibility: moved 6 days ago'
);
select pg_temp.as_user('N');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_too_new', 'create_requires_eligibility: account 3 days old'
);
select pg_temp.as_user('U');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_unconfirmed', 'create_requires_eligibility: unconfirmed email'
);
select pg_temp.as_user('X');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Kurs dla sąsiadów', 'Opis kursu dla sąsiadów z okolicy', 60, null, null) $$,
  'P0001', 'course_no_consent', 'create_requires_eligibility: no consent'
);

select pg_temp.as_user('A');
select lives_ok(
  $$
    insert into course_ids values
      ('a1', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc', 'Podstawy pierwszej pomocy dla sąsiadów', 90, 1, 'Świetlica, sobota 10:00')),
      ('a2', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc II', 'Ciąg dalszy kursu pierwszej pomocy', 60, null, null)),
      ('a3', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc III', 'Trzecia część kursu pierwszej pomocy', 60, null, null))
  $$,
  'create_course: an eligible organiser creates three courses'
);
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Pierwsza pomoc IV', 'Czwarta część kursu pierwszej pomocy', 60, null, null) $$,
  'P0001', 'course_limit_reached', 'open_course_limit: a fourth open course is refused'
);
select public.set_course_open(pg_temp.cid('a3'), false);
select lives_ok(
  $$
    insert into course_ids values
      ('a4', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc IV', 'Czwarta część kursu pierwszej pomocy', 60, null, null))
  $$,
  'open_course_limit: a closed course does not count'
);
select throws_ok(
  $$ select public.set_course_open(pg_temp.cid('a3'), true) $$,
  'P0001', 'course_limit_reached', 'open_course_limit: reopening counts against the limit'
);

reset role;
update public.courses set opened_at = now() - interval '91 days' where id = pg_temp.cid('a2');
set local role authenticated;
select pg_temp.as_user('A');

select lives_ok(
  $$
    insert into course_ids values
      ('a5', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc V', 'Piąta część kursu pierwszej pomocy', 60, null, null))
  $$,
  'open_course_limit: an expired course does not count'
);

select pg_temp.as_user('D');
select lives_ok(
  $$
    insert into course_ids values
      ('d1', public.create_course('pierwsza-pomoc', 'Pierwsza pomoc D', 'Kurs pierwszej pomocy w rzadkim kwadracie', 60, null, 'Garaż za blokiem'))
  $$,
  'create_course: an organiser in a sparse square can still create'
);

reset role;
insert into public.courses (organiser_id, skill_slug, title, description, duration_minutes, is_open)
select pg_temp.uid('D'), 'pierwsza-pomoc', 'Stary kurs ' || n, 'Zamknięty kurs pierwszej pomocy', 60, false
from generate_series(1, 19) as n;
set local role authenticated;
select pg_temp.as_user('D');
select throws_ok(
  $$ select public.create_course('pierwsza-pomoc', 'Pierwsza pomoc E', 'Kolejny kurs pierwszej pomocy', 60, null, null) $$,
  'P0001', 'course_total_limit_reached', 'total_course_limit: a 21st course is refused even when closed ones fill it'
);
reset role;
delete from public.courses where organiser_id = pg_temp.uid('D') and title like 'Stary kurs %';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

select pg_temp.as_user('B');
select set_eq(
  $$ select id from public.get_nearby_courses() $$,
  $$ select id from course_ids where name in ('a1', 'a4', 'a5') $$,
  'nearby_adjacent_square: B (one square away diagonally) sees exactly the open, unexpired courses'
);
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a3')),
  'closed_hidden: a closed course is not listed'
);
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a2')),
  'expired_hidden: a course opened 91 days ago is not listed'
);

select pg_temp.as_user('S');
select ok(
  exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'nearby_same_square: S, in the organiser''s square, sees the course'
);

select pg_temp.as_user('C');
select is(
  (select count(*) from public.get_nearby_courses() where id in (select id from course_ids)),
  0::bigint,
  'nearby_two_away_hidden: C, two squares away, sees no course'
);

select pg_temp.as_user('A');
select ok(
  not exists (select 1 from public.get_nearby_courses() where id in (select id from course_ids where name like 'a%')),
  'own_course_excluded: the organiser does not see their own courses among nearby ones'
);
select is(
  (select hidden_reason from public.get_my_courses() where id = pg_temp.cid('a2')),
  'expired',
  'get_my_courses: the expired course says expired'
);

select public.set_course_open(pg_temp.cid('a5'), false);
select lives_ok(
  $$ select public.renew_course(pg_temp.cid('a2')) $$,
  'renew_course: with a free slot, an expired course is renewed'
);
select pg_temp.as_user('B');
select ok(
  exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a2')),
  'expired_hidden: visible again after renewal'
);

select pg_temp.as_user('V');
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('d1')),
  'square_below_k_hidden: a course in a square with 4 eligible residents is not listed'
);
select pg_temp.as_user('D');
select is(
  (select hidden_reason from public.get_my_courses() where id = pg_temp.cid('d1')),
  'square_hidden',
  'square_below_k_hidden: the organiser is told why'
);

select set_eq(
  $$
    select t.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) as t(name, mode)
    where p.oid = 'public.get_nearby_courses()'::regprocedure and t.mode = 't'
  $$,
  $$ values ('id'), ('skill_name'), ('category_name'), ('title'), ('description'), ('duration_minutes'),
            ('places_left'), ('is_full'), ('signed_up'), ('cell') $$,
  'nearby_has_no_organiser_column: no organiser, level, creation date or meeting details in the output'
);
select set_eq(
  $$
    select t.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) as t(name, mode)
    where p.oid = 'public.get_my_course_signups()'::regprocedure and t.mode = 't'
  $$,
  $$ values ('id'), ('skill_name'), ('category_name'), ('title'), ('description'), ('duration_minutes'),
            ('meeting_details'), ('available') $$,
  'signups_have_no_square: no organiser square, which would follow a move or a square below k = 5'
);

reset role;
delete from public.profile_skills where user_id = pg_temp.uid('A');
set local role authenticated;
select pg_temp.as_user('B');
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'skill_removed_hidden: a course whose organiser no longer holds the skill is not listed'
);
select pg_temp.as_user('A');
select is(
  (select hidden_reason from public.get_my_courses() where id = pg_temp.cid('a1')),
  'skill_removed',
  'skill_removed_hidden: the organiser is told why'
);

reset role;
insert into public.profile_skills (user_id, skill_slug, level) values (pg_temp.uid('A'), 'pierwsza-pomoc', 2);
update public.profiles set paused_at = now() where user_id = pg_temp.uid('A');
set local role authenticated;
select pg_temp.as_user('B');
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'paused_organiser_hidden: a paused organiser''s course is not listed'
);
select pg_temp.as_user('A');
select is(
  (select hidden_reason from public.get_my_courses() where id = pg_temp.cid('a1')),
  'paused',
  'paused_organiser_hidden: the organiser is told why'
);

reset role;
update public.profiles set paused_at = null, paused_until = null where user_id = pg_temp.uid('A');
set local role authenticated;
select pg_temp.as_user('B');
select ok(
  exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'paused_organiser_hidden: visible again after resume'
);

-- A move: the organiser's courses, then a viewer's list.
reset role;
update public.profiles set location_changed_at = now() - interval '6 days' where user_id = pg_temp.uid('A');
set local role authenticated;
select pg_temp.as_user('B');
select ok(
  not exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'recent_move_hides: an organiser who moved 6 days ago has the course hidden'
);
select pg_temp.as_user('A');
select is(
  (select hidden_reason from public.get_my_courses() where id = pg_temp.cid('a1')),
  'recent_move',
  'recent_move_hides: the organiser is told why'
);
select pg_temp.as_user('B');
reset role;
update public.profiles set location_changed_at = now() - interval '8 days' where user_id = pg_temp.uid('A');
set local role authenticated;
select ok(
  exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'recent_move_hides: visible again at 8 days'
);

select pg_temp.as_user('M');
select ok(
  (select eligibility = 'recent_move' and eligible_on is not null and block is null from public.get_course_area())
    and not exists (select 1 from public.get_nearby_courses()),
  'recent_move_hides: a viewer who moved 6 days ago gets recent_move, a date and no list'
);
reset role;
update public.profiles set location_changed_at = now() - interval '8 days' where user_id = pg_temp.uid('M');
set local role authenticated;
select ok(
  (select eligibility = 'ok' and block is not null from public.get_course_area())
    and exists (select 1 from public.get_nearby_courses() where id = pg_temp.cid('a1')),
  'recent_move_hides: the viewer gets the block and the list at 8 days'
);

-- ---------------------------------------------------------------------------
-- Sign-ups
-- ---------------------------------------------------------------------------

select pg_temp.as_user('C');
select throws_ok(
  $$ select public.sign_up_for_course(pg_temp.cid('a1')) $$,
  'P0001', 'course_not_found', 'signup_not_visible_is_not_found: two squares away'
);
select pg_temp.as_user('A');
select throws_ok(
  $$ select public.sign_up_for_course(pg_temp.cid('a1')) $$,
  'P0001', 'course_own', 'signup_own_course'
);
select pg_temp.as_user('B');
select lives_ok($$ select public.sign_up_for_course(pg_temp.cid('a1')) $$, 'sign_up_for_course: B takes the one place');
select throws_ok(
  $$ select public.sign_up_for_course(pg_temp.cid('a1')) $$,
  'P0001', 'course_already_signed_up', 'signup_twice: a second active sign-up is refused'
);
select pg_temp.as_user('E');
select throws_ok(
  $$ select public.sign_up_for_course(pg_temp.cid('a1')) $$,
  'P0001', 'course_full', 'signup_capacity_full: the place is taken'
);

select pg_temp.as_user('B');
select is(
  (select meeting_details from public.get_my_course_signups() where id = pg_temp.cid('a1')),
  'Świetlica, sobota 10:00',
  'meeting_details_only_for_active_signups: the sign-up reads the meeting details'
);
select lives_ok($$ select public.withdraw_from_course(pg_temp.cid('a1')) $$, 'withdraw_from_course: B withdraws');
select ok(
  not exists (select 1 from public.get_my_course_signups() where id = pg_temp.cid('a1')),
  'meeting_details_only_for_active_signups: gone after withdrawing'
);
select pg_temp.as_user('A');
select is(
  (select signup_count from public.get_my_courses() where id = pg_temp.cid('a1')),
  0,
  'signup_count_excludes_withdrawn'
);
select pg_temp.as_user('B');
select lives_ok($$ select public.sign_up_for_course(pg_temp.cid('a1')) $$, 'resignup_after_withdraw');
select lives_ok($$ select public.sign_up_for_course(pg_temp.cid('a4')) $$, 'sign_up_for_course: B also signs up for a4');

-- Hourly limit: E signs up for 10 of 12 courses, then the 11th and a withdraw/re-sign loop fail.
reset role;
with c as (
  insert into public.courses (organiser_id, skill_slug, title, description, duration_minutes)
  select pg_temp.uid('A'), 'pierwsza-pomoc', 'Kurs ' || g, 'Opis kursu numer ' || g || ' dla sąsiadów', 60
  from generate_series(1, 12) as g
  returning id
)
insert into bulk (id) select id from c;
set local role authenticated;
select pg_temp.as_user('E');
select lives_ok(
  $$ select public.sign_up_for_course(id) from (select id from bulk order by id limit 10) as b $$,
  'signup_rate_limit: 10 sign-ups within an hour pass'
);
select throws_ok(
  $$ select public.sign_up_for_course((select id from bulk order by id offset 10 limit 1)) $$,
  'P0001', 'course_signup_rate_limited', 'signup_rate_limit: the 11th within an hour is refused'
);
select public.withdraw_from_course((select id from bulk order by id limit 1));
select throws_ok(
  $$ select public.sign_up_for_course((select id from bulk order by id limit 1)) $$,
  'P0001', 'course_signup_rate_limited', 'signup_rate_limit: a withdraw/re-sign loop still counts'
);

-- ---------------------------------------------------------------------------
-- Other residents' courses
-- ---------------------------------------------------------------------------

select pg_temp.as_user('B');
select throws_ok(
  $$ select public.update_course(pg_temp.cid('a4'), 'Przejęty kurs', 'Próba zmiany cudzego kursu', 60, null, null) $$,
  'P0001', 'course_not_found', 'foreign_course_not_found: update'
);
select throws_ok(
  $$ select public.delete_course(pg_temp.cid('a4')) $$,
  'P0001', 'course_not_found', 'foreign_course_not_found: delete'
);
select throws_ok(
  $$ select public.set_course_open(pg_temp.cid('a4'), false) $$,
  'P0001', 'course_not_found', 'foreign_course_not_found: close'
);
select throws_ok(
  $$ select public.renew_course(pg_temp.cid('a4')) $$,
  'P0001', 'course_not_found', 'foreign_course_not_found: renew'
);

-- ---------------------------------------------------------------------------
-- Location timestamp and lifecycle
-- ---------------------------------------------------------------------------

reset role;
create temp table b_point as
select
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lng
from public.profiles where user_id = pg_temp.uid('B');
grant select on b_point to authenticated;
set local role authenticated;
select pg_temp.as_user('B');

update public.profiles set location_changed_at = '2000-01-01' where user_id = pg_temp.uid('B');
select is(
  (select location_changed_at from public.profiles where user_id = pg_temp.uid('B')),
  null::timestamptz,
  'location_changed_at_server_owned: a direct client write is ignored'
);

select public.save_my_profile(
  'pin', null, (select lat from b_point), (select lng from b_point),
  '[{"slug":"pierwsza-pomoc","level":2}]'::jsonb, null, 0
);
select ok(
  (select location_changed_at is null from public.profiles where user_id = pg_temp.uid('B'))
    and exists (select 1 from public.get_my_course_signups() where id = pg_temp.cid('a4')),
  'location_changed_at_server_owned: a save with the same location keeps it, and the sign-up survives'
);

select pg_temp.as_user('A');
select ok(
  (select count(*) from public.get_my_courses()) = 17,
  'profile_save_keeps_courses: before the save, A has 17 courses'
);
reset role;
create temp table a_point as
select
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lng
from public.profiles where user_id = pg_temp.uid('A');
grant select on a_point to authenticated;
set local role authenticated;
select pg_temp.as_user('A');
select public.save_my_profile(
  'pin', null, (select lat from a_point), (select lng from a_point),
  '[{"slug":"pierwsza-pomoc","level":2}]'::jsonb, null, 0
);
select ok(
  (select count(*) from public.get_my_courses()) = 17
    and (select signup_count from public.get_my_courses() where id = pg_temp.cid('a1')) = 1,
  'profile_save_keeps_courses: re-saving every skill keeps courses and sign-ups'
);

select pg_temp.as_user('B');
select public.save_my_profile(
  'pin', null, (select lat from b_point) + 0.05, (select lng from b_point),
  '[{"slug":"pierwsza-pomoc","level":2}]'::jsonb, null, 0
);
select ok(
  (select location_changed_at > now() - interval '1 minute' from public.profiles where user_id = pg_temp.uid('B'))
    and (select eligibility from public.get_course_area()) = 'recent_move',
  'location_changed_at_server_owned: a new location resets it and makes the resident wait'
);

-- Erasure, with a fresh password sign-in in the JWT.
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
  pg_temp.uid('B'), extract(epoch from now())::bigint), true);
select public.unregister_me();
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","amr":[{"method":"password","timestamp":%s}]}',
  pg_temp.uid('D'), extract(epoch from now())::bigint), true);
select public.unregister_me();
reset role;
select ok(
  not exists (select 1 from public.course_signups where user_id = pg_temp.uid('B'))
    and not exists (select 1 from public.courses where organiser_id = pg_temp.uid('D')),
  'erase_removes_courses_and_signups: unregistering removes the resident''s sign-ups and courses'
);

-- ---------------------------------------------------------------------------
-- Density map
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from public.get_skills_density() where band >= 1)
    and has_function_privilege('anon', 'public.get_skills_density(text)', 'execute'),
  'get_skills_density_unchanged: the map still serves the snapshot to anon'
);

select * from finish();
rollback;

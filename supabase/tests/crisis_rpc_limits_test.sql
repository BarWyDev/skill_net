-- Limits on the crisis RPCs (production readiness audit R-02, R-03, O-04): the activation snapshot
-- keeps the best 1000 residents, the list returns at most 200 rows whatever the limit, and a
-- coordinator can reveal contacts at most 10 times per rolling hour. The required activation reason
-- is covered in crisis_activation_audit_test.sql.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: bypasses RLS, triggers still apply)
-- ---------------------------------------------------------------------------

-- Isolate the fixtures from the local demo seed and from audit rows left by manual reveals: the
-- reveal limit counts audit rows.
delete from public.profiles;
delete from public.contact_reveal_subjects;
delete from public.contact_reveal_events;

-- K1, K2: coordinators. Residents 1–1000 are in central Kraków, 1001–1005 about 1.5 km north of
-- it (lower score), 2001–2002 in Warsaw with phones.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'coord1@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'coord2@test.local');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.local'
from (select generate_series(1, 1005) as i union all select generate_series(2001, 2002)) as s;

insert into public.user_roles (user_id, role, granted_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'coordinator', 'test'),
  ('cccccccc-0000-0000-0000-000000000002', 'coordinator', 'test');

-- Fixture residents consented at sign-up (S-05), so a complete profile stays matchable.
insert into public.consent_events (user_id, version, source)
select u.id, '2026-10-06', 'signup'
from auth.users u
where not exists (select 1 from public.consent_events c where c.user_id = u.id);

insert into public.profiles (user_id, location_source, location)
select
  ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'pin',
  case
    when i <= 1000 then extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0614), 4326)::extensions.geography
    when i <= 1005 then extensions.st_setsrid(extensions.st_makepoint(19.9366, 50.0749), 4326)::extensions.geography
    else extensions.st_setsrid(extensions.st_makepoint(21.0122, 52.2297), 4326)::extensions.geography
  end
from (select generate_series(1, 1005) as i union all select generate_series(2001, 2002)) as s;

insert into public.profile_skills (user_id, skill_slug, level)
select user_id, 'elektryk', 2 from public.profiles;

insert into public.profile_contacts (user_id, phone)
select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+48600' || lpad(i::text, 6, '0')
from generate_series(2001, 2002) as i;

create temp table crisis_ids (name text primary key, id uuid not null);
grant all on crisis_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into crisis_ids
select 'big', public.activate_crisis('awaria-pradu', 'pin', null, 50.0614, 19.9366, 2, 'Awaria prądu w centrum Krakowa');
insert into crisis_ids
select 'small', public.activate_crisis('awaria-pradu', 'pin', null, 52.2297, 21.0122, 1, 'Awaria prądu w centrum Warszawy');

-- ---------------------------------------------------------------------------
-- O-04: the snapshot keeps the best 1000
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*)::integer from public.crisis_matches where crisis_id = (select id from crisis_ids where name = 'big')),
  1000,
  'snapshot_cap: 1005 matching residents leave 1000 rows'
);
select is(
  (select match_count from public.crises where id = (select id from crisis_ids where name = 'big')),
  1000,
  'snapshot_cap: match_count is the number kept'
);
select is(
  (
    select array[min(position), max(position), count(distinct position)::integer]
    from public.crisis_matches
    where crisis_id = (select id from crisis_ids where name = 'big')
  ),
  array[1, 1000, 1000],
  'snapshot_cap: the kept rows are positions 1 to 1000'
);
select is(
  (
    select count(*)::integer
    from public.crisis_matches
    where crisis_id = (select id from crisis_ids where name = 'big')
      and user_id in (
        select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1001, 1005) as i
      )
  ),
  0,
  'snapshot_cap: the lower-scored residents are the ones cut'
);
select is(
  (
    select count(*)::integer from public.crisis_matches
    where crisis_id = (select id from crisis_ids where name = 'small')
  ),
  2,
  'snapshot_cap: a crisis under the cap keeps everyone'
);

-- ---------------------------------------------------------------------------
-- R-03: the list returns at most 200 rows
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_crisis_matches((select id from crisis_ids where name = 'big'), null)),
  200,
  'list_limit: a null limit returns 200 rows'
);
select is(
  (select count(*)::integer from public.get_crisis_matches((select id from crisis_ids where name = 'big'), 5000)),
  200,
  'list_limit: a limit over 200 returns 200 rows'
);
select is(
  (select count(*)::integer from public.get_crisis_matches((select id from crisis_ids where name = 'big'))),
  200,
  'list_limit: the default returns 200 rows'
);
select is(
  (select count(*)::integer from public.get_crisis_matches((select id from crisis_ids where name = 'big'), 5)),
  5,
  'list_limit: a smaller limit is kept'
);
select is(
  (select count(*)::integer from public.get_crisis_matches((select id from crisis_ids where name = 'big'), -1)),
  0,
  'list_limit: a negative limit returns no rows'
);

-- ---------------------------------------------------------------------------
-- R-03: at most 10 reveals per coordinator per hour
-- ---------------------------------------------------------------------------

do $$
begin
  for i in 1..10 loop
    perform public.reveal_crisis_contacts((select id from crisis_ids where name = 'small'), 'Ustalenie kontaktu z elektrykami');
  end loop;
end;
$$;

select throws_ok(
  $$ select public.reveal_crisis_contacts((select id from crisis_ids where name = 'small'), 'Jedenaste ujawnienie w ciągu godziny') $$,
  'P0001',
  'reveal_rate_limited',
  'reveal_limit: the 11th reveal in an hour raises reveal_rate_limited'
);
select throws_ok(
  $$ select public.reveal_crisis_contacts((select id from crisis_ids where name = 'big'), 'Ujawnienie w innym kryzysie') $$,
  'P0001',
  'reveal_rate_limited',
  'reveal_limit: the limit covers every crisis'
);
select throws_ok(
  $$ select public.reveal_crisis_contacts((select id from crisis_ids where name = 'small'), 'krótko') $$,
  'P0001',
  'reason_required',
  'reveal_limit: a bad reason is reported before the limit'
);

reset role;
select is(
  (select count(*)::integer from public.contact_reveal_events where revealed_by = 'cccccccc-0000-0000-0000-000000000001'),
  10,
  'reveal_limit: a refused reveal is not logged'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.reveal_crisis_contacts((select id from crisis_ids where name = 'small'), 'Drugi koordynator ma osobny limit')),
  2,
  'reveal_limit: the limit is per coordinator'
);

reset role;
update public.contact_reveal_events
set occurred_at = occurred_at - interval '61 minutes'
where revealed_by = 'cccccccc-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.reveal_crisis_contacts((select id from crisis_ids where name = 'small'), 'Po godzinie limit się odnawia') $$,
  'reveal_limit: reveals older than an hour no longer count'
);

reset role;

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'contact_reveal_events_revealed_by_occurred_at_idx'
  ),
  'reveal_limit: the throttle has its index'
);

select * from finish();
rollback;

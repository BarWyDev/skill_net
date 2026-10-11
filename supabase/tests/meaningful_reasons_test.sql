-- Meaningful reason guarantees (security audit F-05): normalisation of invisible and unusual
-- whitespace, the length bounds on the normalised text, the word rule, and its use by both the
-- break-glass reveal and crisis activation. Run with `npm run test:db`. Rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- check_reason (as postgres)
-- ---------------------------------------------------------------------------

select is(
  public.check_reason('  Pożar w bloku, brak prądu  '),
  'Pożar w bloku, brak prądu',
  'normalise: surrounding spaces are trimmed'
);
select is(
  public.check_reason(E'Pożar\u200b\u200b  w\tbloku,\u00a0brak\nprądu'),
  'Pożar w bloku, brak prądu',
  'normalise: zero-width spaces, tabs, newlines and no-break spaces become one space'
);
select is(
  public.check_reason(E'\ufeffBrak\u200d potwierdzeń\u202e od rana\u2060'),
  'Brak potwierdzeń od rana',
  'normalise: the BOM, joiners, direction overrides and word joiners are removed'
);
select is(
  public.check_reason('ŻÓŁTY ALARM: ewakuacja szkoły'),
  'ŻÓŁTY ALARM: ewakuacja szkoły',
  'normalise: Polish capitals and punctuation are kept'
);

select throws_ok($$ select public.check_reason(null) $$, 'P0001', 'reason_required', 'required: null');
select throws_ok(
  $$ select public.check_reason(repeat(E'\u200b', 10)) $$,
  'P0001', 'reason_required', 'required: ten zero-width spaces'
);
select throws_ok(
  $$ select public.check_reason(E'ab\u200b\u200b\u200b\u200b\u200b\u200b\u200bcd') $$,
  'P0001', 'reason_required', 'required: under 10 visible characters padded with zero-width spaces'
);
select throws_ok(
  $$ select public.check_reason('aaaaaaaaaa') $$,
  'P0001', 'reason_required', 'required: one repeated letter'
);
select throws_ok(
  $$ select public.check_reason('aaa aaa aaa') $$,
  'P0001', 'reason_required', 'required: three words of one repeated letter'
);
select throws_ok(
  $$ select public.check_reason('1234567890 !!!') $$,
  'P0001', 'reason_required', 'required: digits and punctuation only'
);
select throws_ok(
  $$ select public.check_reason('Pożarrrrrr') $$,
  'P0001', 'reason_required', 'required: a single word'
);
select throws_ok(
  $$ select public.check_reason(repeat('Pożar domu ', 46)) $$,
  'P0001', 'reason_too_long', 'too long: over 500 characters after normalising'
);
select is(
  char_length(public.check_reason(repeat(E'Pożar domu\u200b ', 45))),
  494,
  'bounds: invisible characters do not count towards the 500'
);
select lives_ok(
  $$ select public.check_reason('Pożar domu') $$,
  'accepted: two short words with enough distinct letters'
);
select ok(
  not has_function_privilege('anon', 'public.check_reason(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.check_reason(text)', 'execute'),
  'privileges: clients cannot call check_reason directly'
);

-- ---------------------------------------------------------------------------
-- Through the RPCs (as a coordinator)
-- ---------------------------------------------------------------------------

delete from public.profiles;

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000005', 'coord5@test.local');
insert into public.user_roles (user_id, role, granted_by)
values ('cccccccc-0000-0000-0000-000000000005', 'coordinator', 'test');

create temp table crisis_ids (name text primary key, id uuid);
grant select, insert on crisis_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000005","role":"authenticated"}', true);

select throws_ok(
  $$ select public.activate_crisis('pozar', 'postcode', '31-001', null, null, 1, repeat(E'\u200b', 12)) $$,
  'P0001', 'reason_required', 'activate_crisis: an invisible reason is refused'
);
select throws_ok(
  $$ select public.activate_crisis('pozar', 'postcode', '31-001', null, null, 1, 'aaaaaaaaaaaa') $$,
  'P0001', 'reason_required', 'activate_crisis: a junk reason is refused'
);
select lives_ok(
  $$
    insert into crisis_ids
    select 'live', public.activate_crisis('pozar', 'postcode', '31-001', null, null, 1, E'Pożar\u200b kamienicy  przy Rynku')
  $$,
  'activate_crisis: a real reason activates'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'live'), repeat(E'\u200b', 10)) $$,
  'P0001', 'reason_required', 'reveal_crisis_contacts: ten zero-width spaces are refused (the audit reproduction)'
);
select throws_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'live'), 'aaaaaaaaaa') $$,
  'P0001', 'reason_required', 'reveal_crisis_contacts: a junk reason is refused'
);
select lives_ok(
  $$ select * from public.reveal_crisis_contacts((select id from crisis_ids where name = 'live'), E'Brak\u200b odpowiedzi\u00a0od godziny') $$,
  'reveal_crisis_contacts: a real reason reveals'
);

reset role;

select is(
  (
    select array[c.reason, e.reason]
    from public.crises c
    join public.contact_reveal_events e on e.crisis_id = c.id
    where c.id = (select id from crisis_ids where name = 'live')
  ),
  array['Pożar kamienicy przy Rynku', 'Brak odpowiedzi od godziny'],
  'stored: both logs hold the normalised reason'
);

select * from finish();
rollback;

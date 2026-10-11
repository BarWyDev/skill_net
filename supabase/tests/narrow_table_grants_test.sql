-- Narrow table grant guarantees (security audit F-12): clients hold exactly the table privileges
-- the app uses, never TRUNCATE, REFERENCES, TRIGGER or MAINTAIN, and new tables start closed.
-- A new client grant must be added to the expected list below on purpose.
-- Run with `npm run test:db`. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Every table-level privilege anon or authenticated holds on a public table.
create temp view client_grants as
select c.relname::text as tbl, r.rolname::text as role, p.priv::text as priv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
cross join (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
) as p(priv)
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm')
  and has_table_privilege(r.rolname, c.oid, p.priv);

select is(
  (select count(*) from client_grants where priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')),
  0::bigint,
  'no_dangerous_privileges: no client holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any table'
);

select set_eq(
  $$ select tbl, priv from client_grants where role = 'anon' $$,
  $$ values
       ('consent_versions', 'SELECT'),
       ('crisis_type_skills', 'SELECT'),
       ('crisis_types', 'SELECT'),
       ('postcodes', 'SELECT'),
       ('skill_categories', 'SELECT'),
       ('skills', 'SELECT'),
       ('team_role_skills', 'SELECT'),
       ('team_template_roles', 'SELECT'),
       ('team_templates', 'SELECT') $$,
  'anon_exact: anon reads the reference tables and nothing else'
);

select set_eq(
  $$ select tbl, priv from client_grants where role = 'authenticated' $$,
  $$ values
       ('consent_events', 'SELECT'),
       ('consent_versions', 'SELECT'),
       ('crises', 'SELECT'),
       ('crisis_type_skills', 'SELECT'),
       ('crisis_types', 'SELECT'),
       ('postcodes', 'SELECT'),
       ('profile_contacts', 'DELETE'),
       ('profile_contacts', 'SELECT'),
       ('profile_skills', 'DELETE'),
       ('profile_skills', 'INSERT'),
       ('profile_skills', 'SELECT'),
       ('profile_skills', 'UPDATE'),
       ('profiles', 'DELETE'),
       ('profiles', 'INSERT'),
       ('profiles', 'SELECT'),
       ('profiles', 'UPDATE'),
       ('skill_categories', 'SELECT'),
       ('skills', 'SELECT'),
       ('team_role_skills', 'SELECT'),
       ('team_template_roles', 'SELECT'),
       ('team_templates', 'SELECT'),
       ('user_roles', 'SELECT') $$,
  'authenticated_exact: signed-in users read reference data and their own rows, and write only their profile'
);

select ok(
  has_column_privilege('authenticated', 'public.profile_contacts', 'user_id', 'INSERT')
  and has_column_privilege('authenticated', 'public.profile_contacts', 'phone', 'INSERT')
  and has_column_privilege('authenticated', 'public.profile_contacts', 'phone', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profile_contacts', 'phone_verified_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.profile_contacts', 'phone_verified_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profile_contacts', 'updated_at', 'UPDATE'),
  'profile_contacts_columns: the owner writes the number only, never its verification'
);

-- New tables start closed (as postgres, like every migration).
create table public.f12_probe (id integer primary key);

select ok(
  not has_table_privilege('anon', 'public.f12_probe', 'SELECT')
  and not has_table_privilege('anon', 'public.f12_probe', 'INSERT')
  and not has_table_privilege('authenticated', 'public.f12_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.f12_probe', 'DELETE')
  and not has_table_privilege('authenticated', 'public.f12_probe', 'TRUNCATE'),
  'default_privileges: a table created by postgres starts with no client privileges'
);

-- The app's paths still work with the narrowed grants.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$ select count(*) from public.skills join public.skill_categories c on c.slug = skills.category_slug $$,
  'app_paths: anon still reads the skill taxonomy for the map and sign-up pages'
);
select throws_ok(
  $$ delete from public.skills $$,
  '42501',
  null::text,
  'app_paths: anon can no longer write reference data, whatever the policies say'
);

reset role;

select * from finish();
rollback;

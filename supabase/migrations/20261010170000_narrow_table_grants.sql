-- Narrow table grants (security audit F-12, docs/security-audit.md).
--
-- Supabase's default privileges give anon and authenticated every table privilege on each new
-- table. The first migration's tables (profiles, profile_skills, skills, skill_categories,
-- postcodes) kept all of them, and every table kept MAINTAIN (Postgres 17), because later
-- migrations revoked privileges by name. RLS blocks the row operations today, and PostgREST cannot
-- send TRUNCATE (which ignores RLS), but one permissive policy written later, for example a
-- `for all` policy meant for reads, would let anon wipe or forge data.
--
-- Every table now holds exactly the privileges the app uses, and nothing else:
--   * anon: SELECT on the public reference tables only;
--   * authenticated: SELECT on the reference tables, SELECT/INSERT/UPDATE/DELETE on the caller's
--     own profile rows (RLS keeps them to the owner; the profile RPCs run as the caller), SELECT on
--     the tables whose policies show a user their own rows, and the existing column-level grants on
--     profile_contacts;
--   * nobody: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
-- Functions keep their explicit per-function grants.
--
-- New tables created by postgres (every migration) now start with no client privileges. A
-- migration that adds a table grants what clients need explicitly (see CLAUDE.md).
--
-- Nothing the app does changes. The anon SELECT on profiles and profile_skills returned no rows
-- under RLS anyway; it is now refused instead.

revoke all on all tables in schema public from anon, authenticated;

-- Reference data, read by the public pages, the profile form and the coordinator panel.
grant select on
  public.skill_categories,
  public.skills,
  public.postcodes,
  public.crisis_types,
  public.crisis_type_skills,
  public.team_templates,
  public.team_template_roles,
  public.team_role_skills,
  public.consent_versions
to anon, authenticated;

-- The resident's own profile. RLS: owner only, per operation.
grant select, insert, update, delete on public.profiles, public.profile_skills to authenticated;

-- The phone: the owner reads and deletes it, inserts it and changes only the number (as in
-- 20261003120000_resident_phone_and_availability.sql).
grant select, delete on public.profile_contacts to authenticated;
grant insert (user_id, phone) on public.profile_contacts to authenticated;
grant update (phone) on public.profile_contacts to authenticated;

-- Read-only tables whose policies show a signed-in user their own rows (or coordinators the crises).
grant select on public.user_roles, public.consent_events, public.crises to authenticated;

-- Tables created by postgres from now on start closed to clients.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

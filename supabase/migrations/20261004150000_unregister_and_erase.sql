-- Unregister and erase (roadmap S-14, FR-007).
--
-- A resident can erase their own account at any time. Every guarantee lives here, so the app
-- layer cannot weaken it:
--   * the caller erases only themselves (`auth.uid()`), never anyone else;
--   * erasure needs a password sign-in from the last 5 minutes, read from the JWT `amr` claim, so a
--     stolen or left-open session cannot erase the account by calling this function directly;
--   * one delete of the `auth.users` row removes everything personal in the same transaction: the
--     email (auth.users), GoTrue's identities and sessions, and through the cascades `profiles`
--     (location, availability), `profile_skills`, `profile_contacts` (phone), `crisis_matches`
--     (the resident vanishes from active crisis lists, reveals and team assembly) and `user_roles`;
--   * the audit records keep the bare user id (see the column comments below). Once the
--     auth.users row is gone the id resolves to no one in the system, and the logs still answer
--     "who saw whose number" and "who ran which crisis".
--
-- Deletion is immediate, so the PRD's "fully removed within 30 days" holds on day 0 and no
-- scheduled purge is needed.

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Erases the caller's account and all personal data. Raises `not_authenticated` without a user and
-- `reauthentication_required` without a recent password sign-in; nothing is deleted in either case.
-- Security definer (owned by postgres): `authenticated` has no privileges on auth.users.
create function public.unregister_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- GoTrue stamps `amr` with the sign-in time, and a token refresh keeps it, so only a password
  -- typed in the last 5 minutes passes.
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as a
    where a ->> 'method' = 'password'
      and (a ->> 'timestamp')::numeric >= extract(epoch from now()) - 300
  ) then
    raise exception 'reauthentication_required';
  end if;

  delete from auth.users u where u.id = v_user_id;
end;
$$;

alter function public.unregister_me() owner to postgres;

-- ---------------------------------------------------------------------------
-- Retention of audit ids
-- ---------------------------------------------------------------------------

comment on column public.coordinator_role_events.user_id is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';
comment on column public.contact_reveal_subjects.user_id is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';
comment on column public.contact_reveal_events.revealed_by is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';
comment on column public.crises.activated_by is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';
comment on column public.crises.ended_by is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.unregister_me() from public, anon;
grant execute on function public.unregister_me() to authenticated;

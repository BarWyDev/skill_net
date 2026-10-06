-- Sign-up consent (roadmap S-05, FR-001).
--
-- A resident gives explicit consent to data processing when they sign up. Every guarantee lives
-- here, so the app layer cannot weaken it:
--   * `consent_versions` lists the published consent texts. The app sends the current version
--     with the sign-up; a version is published by a migration, before the app starts sending it;
--   * `consent_events` is the append-only audit trail. Clients read their own rows and never
--     write: rows come only from the sign-up trigger and `record_my_consent`;
--   * an email sign-up without a published `consent_version` in its user metadata is refused
--     inside GoTrue's insert (`consent_required`), so calling /auth/v1/signup with the public
--     key cannot create an account without consent. Accounts created through the Supabase
--     dashboard or admin API are email accounts too, so they need the same metadata. Rows
--     inserted straight into auth.users without app metadata (test fixtures) are not checked;
--   * `profile_is_matchable` requires at least one consent row, so a resident who never
--     consented is absent from new crisis activations and from the density map. A newer
--     version only re-asks in the app (the consent gate); it never removes anyone from matching;
--   * the user id is kept as a bare id after erasure (S-14), like the other audit records, and
--     still proves the consent behind the processing that happened.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.consent_versions (
  version text primary key,
  published_at timestamptz not null default now()
);

-- No FK to auth.users on purpose: the record outlives the account and never blocks erasure.
-- Holds the user id only, never an email.
create table public.consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  version text not null references public.consent_versions (version),
  source text not null check (source in ('signup', 'reaccept')),
  occurred_at timestamptz not null default now()
);

create index consent_events_user_id_occurred_at_idx on public.consent_events (user_id, occurred_at desc);

comment on column public.consent_events.user_id is
  'Kept as a bare id after account erasure (S-14); it resolves to no one once the auth.users row is gone.';

insert into public.consent_versions (version) values ('2026-10-06');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Records the consent given at sign-up, in the same transaction as the auth.users insert.
-- Security definer (owned by postgres): GoTrue inserts as supabase_auth_admin, which has no
-- privileges on public tables.
create function public.record_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := new.raw_user_meta_data ->> 'consent_version';
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email' then
    return new;
  end if;

  if v_version is null
     or not exists (select 1 from public.consent_versions v where v.version = v_version) then
    raise exception 'consent_required';
  end if;

  insert into public.consent_events (user_id, version, source)
  values (new.id, v_version, 'signup');

  return new;
end;
$$;

alter function public.record_signup_consent() owner to postgres;

create trigger record_signup_consent
after insert on auth.users
for each row execute function public.record_signup_consent();

-- Records the caller's consent to p_version (the consent gate for accounts that have none, or
-- an older one). Raises `not_authenticated` without a user and `unknown_consent_version` for a
-- version that was never published.
create function public.record_my_consent(p_version text)
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

  if p_version is null
     or not exists (select 1 from public.consent_versions v where v.version = p_version) then
    raise exception 'unknown_consent_version';
  end if;

  insert into public.consent_events (user_id, version, source)
  values (v_user_id, p_version, 'reaccept');
end;
$$;

alter function public.record_my_consent(text) owner to postgres;

-- The version of the caller's most recent consent, or null when they never consented.
-- Security invoker: RLS lets the owner read their own rows.
create function public.my_latest_consent_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select c.version
  from public.consent_events c
  where c.user_id = (select auth.uid())
  order by c.occurred_at desc, c.id desc
  limit 1
$$;

-- Eligibility contract: a complete profile with no active pause, from a resident who consented
-- at least once. Security invoker, as before.
create or replace function public.profile_is_matchable(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.location is not null
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id)
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and exists (select 1 from public.consent_events c where c.user_id = p.user_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.consent_versions enable row level security;
alter table public.consent_events enable row level security;

create policy "consent_versions: anyone can read" on public.consent_versions
  for select to anon, authenticated using (true);

-- A user reads only their own consent history. No write policies: rows come only from the
-- sign-up trigger and record_my_consent.
create policy "consent_events: owner can read" on public.consent_events
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. RLS already blocks
-- these writes; revoking them as well makes a forged consent fail with permission denied.
revoke insert, update, delete, truncate, references, trigger on public.consent_versions from anon, authenticated;
revoke all on public.consent_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.consent_events from authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default.
revoke execute on function public.record_signup_consent() from public, anon, authenticated;
revoke execute on function public.record_my_consent(text) from public, anon;
grant execute on function public.record_my_consent(text) to authenticated;
revoke execute on function public.my_latest_consent_version() from public, anon;
grant execute on function public.my_latest_consent_version() to authenticated;

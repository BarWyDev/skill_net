-- Sign-up consent: no outdated versions (security audit R-05).
--
-- The sign-up trigger accepted any published consent version, so an email sign-up through the
-- public API with an outdated `consent_version` created an account. A version now carries
-- `retired_at`, and the trigger refuses a retired version with `consent_required`.
--
-- Publishing a new version stays expand-then-contract, so sign-ups never fail mid-deploy:
--   1. a migration publishes the new version (the app on master still sends the previous one);
--   2. the app starts sending it (CURRENT_CONSENT_VERSION in src/lib/consent.ts);
--   3. a later migration retires the previous version.
-- An account that consented to a retired version keeps its records; the consent gate re-asks it.
--
-- Everything else is unchanged from 20261006140000_signup_consent.sql. `create or replace` keeps
-- the function's owner (postgres) and its revoked execute.

alter table public.consent_versions add column retired_at timestamptz;

comment on column public.consent_versions.retired_at is
  'Set once the app no longer sends this version; the sign-up trigger then refuses it (R-05).';

-- The app has sent 2026-10-21 since the neighbour-courses release.
update public.consent_versions set retired_at = now() where version <> '2026-10-21';

create or replace function public.record_signup_consent()
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
     or not exists (
       select 1 from public.consent_versions v
       where v.version = v_version and v.retired_at is null
     ) then
    raise exception 'consent_required';
  end if;

  insert into public.consent_events (user_id, version, source)
  values (new.id, v_version, 'signup');

  return new;
end;
$$;

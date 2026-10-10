-- Direct writes follow the app's rules (security audit F-07, docs/security-audit.md).
--
-- A resident may write their own rows directly through PostgREST (the RPCs run as the caller), and
-- triggers keep the invariants on every path. Three rules were only enforced by the RPCs:
--
--   * phone: `save_my_profile` accepts a +48 mobile number only (`^\+48[4-8]\d{8}$`), but the table
--     check allows any +48 and nine digits, so a direct PATCH could store a landline. A new trigger
--     applies the RPC's rule to every write by a client role (anon, authenticated). The table check
--     stays as it is, so operator writes such as the local seed's unassignable `+48000…` numbers
--     still load;
--   * timestamps: a direct write could set `profiles.created_at` and `profiles.paused_at` to any
--     time. Both are now the server's: `created_at` is the insert time and never changes, and a new
--     or changed `paused_at` becomes `now()`, whoever writes it. `updated_at` was already set by
--     the location trigger;
--   * consent: `record_my_consent` appended a `reaccept` row on every call. It is now a no-op when
--     the caller's latest consent is already that version, so repeated calls add nothing.
--
-- Existing rows are left as they are. Expand only: two new triggers and one replaced function body.

-- ---------------------------------------------------------------------------
-- Phone
-- ---------------------------------------------------------------------------

create function public.profile_contacts_check_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and new.phone !~ '^\+48[4-8]\d{8}$' then
    raise exception 'invalid_phone';
  end if;
  return new;
end;
$$;

create trigger profile_contacts_check_phone
before insert or update on public.profile_contacts
for each row execute function public.profile_contacts_check_phone();

-- ---------------------------------------------------------------------------
-- Server-owned profile timestamps
-- ---------------------------------------------------------------------------

create function public.profiles_server_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.paused_at is not null then
      new.paused_at := now();
    end if;
  else
    new.created_at := old.created_at;
    if new.paused_at is not null and new.paused_at is distinct from old.paused_at then
      new.paused_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_server_timestamps
before insert or update on public.profiles
for each row execute function public.profiles_server_timestamps();

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

-- record_my_consent from 20261006140000, a no-op when the latest consent is already p_version.
create or replace function public.record_my_consent(p_version text)
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

  if (
    select e.version
    from public.consent_events e
    where e.user_id = v_user_id
    order by e.occurred_at desc, e.id desc
    limit 1
  ) is not distinct from p_version then
    return;
  end if;

  insert into public.consent_events (user_id, version, source)
  values (v_user_id, p_version, 'reaccept');
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Trigger functions: nobody calls them directly.
revoke execute on function public.profile_contacts_check_phone() from public, anon, authenticated;
revoke execute on function public.profiles_server_timestamps() from public, anon, authenticated;

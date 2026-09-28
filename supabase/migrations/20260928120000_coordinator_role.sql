-- Coordinator role (roadmap S-02, FR-017).
--
-- The role lives in Postgres, not in the JWT, so S-03's ranking RPC can gate on it and a
-- revoke takes effect on the caller's next request instead of after a token refresh.
--   * nobody promotes themselves: clients have no write privilege on `user_roles` and cannot
--     execute the grant/revoke functions;
--   * the operator grants and revokes only through `grant_coordinator` / `revoke_coordinator`
--     (SQL editor, as postgres), which write every change to `coordinator_role_events`;
--   * `is_coordinator()` is the single role check the app and S-03 reuse.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('coordinator')),
  granted_at timestamptz not null default now(),
  -- The operator's note: who granted it and why. Not an app account.
  granted_by text not null,
  primary key (user_id, role)
);

-- Append-only history of grants and revokes. No FK to auth.users on purpose: the history
-- outlives the account, and it never blocks account erasure (S-14 decides retention).
-- Holds the user id only, never an email.
create table public.coordinator_role_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null check (action in ('grant', 'revoke')),
  note text not null,
  occurred_at timestamptz not null default now()
);

create index coordinator_role_events_user_id_idx on public.coordinator_role_events (user_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Whether the caller holds the coordinator role. Security invoker: RLS lets the owner read
-- their own row, and inside a security-definer caller (S-03) the owner bypasses RLS while
-- auth.uid() still reads the caller's JWT, so the answer is the caller's in both contexts.
create function public.is_coordinator()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'coordinator'
  )
$$;

-- The account a grant or revoke targets. Validates the operator's note too.
create function public.role_change_target(p_email text, p_note text)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required';
  end if;

  begin
    select id into strict v_user_id
    from auth.users
    where lower(email) = lower(btrim(p_email));
  exception
    when no_data_found then
      raise exception 'unknown_email';
    when too_many_rows then
      raise exception 'ambiguous_email';
  end;

  return v_user_id;
end;
$$;

-- Grants the coordinator role. Granting it twice is a no-op with a notice and no event.
create function public.grant_coordinator(p_email text, p_note text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := public.role_change_target(p_email, p_note);
begin
  insert into public.user_roles (user_id, role, granted_by)
  values (v_user_id, 'coordinator', btrim(p_note))
  on conflict (user_id, role) do nothing;

  if not found then
    raise notice 'already_coordinator';
    return;
  end if;

  insert into public.coordinator_role_events (user_id, action, note)
  values (v_user_id, 'grant', btrim(p_note));
end;
$$;

-- Revokes the coordinator role. Revoking from a non-coordinator is a no-op with a notice.
create function public.revoke_coordinator(p_email text, p_note text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := public.role_change_target(p_email, p_note);
begin
  delete from public.user_roles
  where user_id = v_user_id and role = 'coordinator';

  if not found then
    raise notice 'not_coordinator';
    return;
  end if;

  insert into public.coordinator_role_events (user_id, action, note)
  values (v_user_id, 'revoke', btrim(p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.coordinator_role_events enable row level security;

-- A user reads only their own role. No write policies: roles change only through the
-- operator functions above.
create policy "user_roles: owner can read" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- coordinator_role_events: no policies. Clients never read or write the history.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. RLS already blocks
-- these writes; revoking them as well makes self-promotion fail with permission denied.
revoke all on public.user_roles from anon;
revoke insert, update, delete, truncate, references, trigger on public.user_roles from authenticated;
revoke all on public.coordinator_role_events from anon, authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default. Without
-- these revokes, any signed-in user could call grant_coordinator over /rest/v1/rpc.
revoke execute on function public.is_coordinator() from public, anon;
grant execute on function public.is_coordinator() to authenticated;
revoke execute on function public.role_change_target(text, text) from public, anon, authenticated;
revoke execute on function public.grant_coordinator(text, text) from public, anon, authenticated;
revoke execute on function public.revoke_coordinator(text, text) from public, anon, authenticated;

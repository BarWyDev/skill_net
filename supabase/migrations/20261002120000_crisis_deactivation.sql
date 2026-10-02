-- Crisis deactivation (roadmap S-04, FR-015).
--
-- A coordinator ends an active crisis through one security-definer RPC. Every guarantee lives
-- here, so the app layer cannot weaken it:
--   * only a coordinator (`is_coordinator()`) ends a crisis, and any coordinator may end any
--     active crisis (shift handover);
--   * ending deletes the crisis's ranking snapshot in the same transaction as the status flip,
--     so after a crisis no record links a resident to the incident; the crisis keeps only its
--     summary (type, radius, dates, match_count);
--   * ending an already-ended crisis is an expected outcome, not an error: it returns false and
--     changes nothing. The row lock serialises concurrent calls, so exactly one returns true.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- `ended_by` has no FK to auth.users on purpose, like `activated_by`: the record outlives the
-- account and never blocks account erasure (S-14 decides retention).
alter table public.crises add column ended_by uuid;

-- An active crisis has no end data; an ended one has its end time. `ended_by` may be null on an
-- ended crisis only if it was ended outside end_crisis (it always sets it).
alter table public.crises add constraint crises_status_matches_end_fields check (
  (status = 'active' and ended_at is null and ended_by is null)
  or (status = 'ended' and ended_at is not null)
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Ends a crisis and deletes its ranking snapshot. Returns true when this call ended it, false
-- when it was already ended.
create function public.end_crisis(p_crisis_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- Lock before checking the status, so concurrent calls see each other's result.
  select c.status into v_status from public.crises c where c.id = p_crisis_id for update;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status = 'ended' then
    return false;
  end if;

  update public.crises
  set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
  where id = p_crisis_id;

  delete from public.crisis_matches where crisis_id = p_crisis_id;

  return true;
end;
$$;

alter function public.end_crisis(uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.end_crisis(uuid) from public, anon;
grant execute on function public.end_crisis(uuid) to authenticated;

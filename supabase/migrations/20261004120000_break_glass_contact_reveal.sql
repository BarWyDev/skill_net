-- Break-glass contact reveal (roadmap S-09, FR-012).
--
-- When nobody has confirmed (network down, night, no SMS path yet), a coordinator can deliberately
-- reveal the phone numbers of everyone matched to an active crisis. This is the only path by which
-- anyone but the owner reads a number. Every guarantee lives here, so the app layer cannot weaken it:
--   * only a coordinator (`is_coordinator()`) reveals, and only on an active crisis;
--   * a reason of 10–500 characters (after trimming) is required and stored with the event;
--   * the event row and one subject row per exposed resident are written in the same transaction
--     that returns the numbers, and the returned rows are read through the subject rows, so no
--     number is returned without being logged;
--   * the scope is every snapshot row with a current phone number, in `position` order, with no
--     page cap; residents without a number are not returned;
--   * clients have no privileges on the audit tables and no policies: nobody reads or alters the
--     log through the API;
--   * the log deliberately survives `end_crisis` and account deletion (no FK to the resident or
--     the coordinator). This is a documented exception to the S-04 rule that no record links a
--     resident to an incident after it ends: it is a log of access to personal data, and it
--     answers "who saw my number, when and why". S-14 decides its retention.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per reveal. `revealed_by` has no FK to auth.users on purpose, like `activated_by`: the
-- record outlives the account and never blocks account erasure.
create table public.contact_reveal_events (
  id bigint generated always as identity primary key,
  crisis_id uuid not null references public.crises (id),
  revealed_by uuid not null,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  revealed_count integer not null default 0,
  occurred_at timestamptz not null default now()
);

create index contact_reveal_events_crisis_id_idx on public.contact_reveal_events (crisis_id);

-- One row per resident whose number a reveal returned. The user id only, never the number. No FK
-- to the resident, so the row survives their deletion.
create table public.contact_reveal_subjects (
  event_id bigint not null references public.contact_reveal_events (id),
  user_id uuid not null,
  primary key (event_id, user_id)
);

-- "Who saw my number" queries, and S-14 erasure.
create index contact_reveal_subjects_user_id_idx on public.contact_reveal_subjects (user_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Logs a reveal and returns the current number of every matched resident who has one, in
-- `position` order. The other columns mean the same as in `get_crisis_matches`.
create function public.reveal_crisis_contacts(p_crisis_id uuid, p_reason text)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  matched_skills jsonb,
  phone text,
  phone_verified boolean,
  availability_slots integer,
  available_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reason text := btrim(p_reason);
  v_event_id bigint;
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- FOR SHARE serialises with end_crisis (FOR UPDATE): the reveal either finishes before the
  -- crisis ends or sees it ended, and never reads a half-deleted snapshot.
  select c.status into v_status from public.crises c where c.id = p_crisis_id for share;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'reason_required';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long';
  end if;

  insert into public.contact_reveal_events (crisis_id, revealed_by, reason)
  values (p_crisis_id, (select auth.uid()), v_reason)
  returning id into v_event_id;

  insert into public.contact_reveal_subjects (event_id, user_id)
  select v_event_id, m.user_id
  from public.crisis_matches m
  join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = p_crisis_id;

  get diagnostics v_count = row_count;

  update public.contact_reveal_events e set revealed_count = v_count where e.id = v_event_id;

  -- Driven by the subject rows, so every returned number is logged.
  return query
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    m.matched_skills,
    pc.phone,
    pc.phone_verified_at is not null,
    p.availability_slots,
    public.availability_covers(p.availability_slots, now())
  from public.contact_reveal_subjects s
  join public.crisis_matches m on m.crisis_id = p_crisis_id and m.user_id = s.user_id
  join public.profile_contacts pc on pc.user_id = s.user_id
  left join public.profiles p on p.user_id = s.user_id
  where s.event_id = v_event_id
  order by m.position;
end;
$$;

alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.contact_reveal_events enable row level security;
alter table public.contact_reveal_subjects enable row level security;

-- contact_reveal_events, contact_reveal_subjects: no policies. Clients never read or write the log.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. Revoking them makes
-- every client read or write fail with permission denied, coordinators included.
revoke all on public.contact_reveal_events from anon, authenticated;
revoke all on public.contact_reveal_subjects from anon, authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default.
revoke execute on function public.reveal_crisis_contacts(uuid, text) from public, anon;
grant execute on function public.reveal_crisis_contacts(uuid, text) to authenticated;

-- Break-glass reveal: log exactly what is shown (roadmap S-09, review finding F3).
--
-- In 20261004120000_break_glass_contact_reveal.sql the subject rows and the returned rows came
-- from two statements. Under READ COMMITTED each took its own snapshot of `profile_contacts`, so a
-- resident who deleted or changed their number between them was logged but not shown, or shown
-- with a newer number than the one read for the log. Every number was still logged, but the log
-- could overstate what the coordinator saw.
--
-- This version reads the matches and numbers once, in one statement: the subject insert, the
-- event's `revealed_count` and the returned rows all come from the same CTE, so the logged set
-- equals the shown set. The signature, checks, error codes, grants and owner are unchanged.

create or replace function public.reveal_crisis_contacts(p_crisis_id uuid, p_reason text)
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

  -- One statement, one snapshot: the logged residents, the count and the returned rows are the
  -- same set. Data-modifying CTEs run to completion even though the final select does not read them.
  return query
  with revealed as materialized (
    select
      m.user_id,
      m.rank,
      m.position,
      m.distance_m,
      m.matched_skills,
      pc.phone,
      pc.phone_verified_at,
      p.availability_slots
    from public.crisis_matches m
    join public.profile_contacts pc on pc.user_id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.crisis_id = p_crisis_id
  ),
  logged as (
    insert into public.contact_reveal_subjects (event_id, user_id)
    select v_event_id, r.user_id from revealed r
  ),
  counted as (
    update public.contact_reveal_events e
    set revealed_count = (select count(*) from revealed)
    where e.id = v_event_id
  )
  select
    r.rank,
    r.position,
    round(r.distance_m / 500.0) * 0.5,
    r.matched_skills,
    r.phone,
    r.phone_verified_at is not null,
    r.availability_slots,
    public.availability_covers(r.availability_slots, now())
  from revealed r
  order by r.position;
end;
$$;

alter function public.reveal_crisis_contacts(uuid, text) owner to postgres;

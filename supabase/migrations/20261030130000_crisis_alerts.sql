-- Crisis SMS alerts: queueing and sending (roadmap S-07, Phase 3; FR-011, US-01).
--
-- A coordinator sends an SMS alert to the next N people on an active crisis's ranking. This
-- migration stores who was alerted and what became of each message, and decides who may be texted:
--   * `crisis_alerts` holds one row per alerted resident per crisis. It hangs off the ranking
--     snapshot (`crisis_matches`), so ending the crisis, or the resident erasing their account,
--     deletes it with the snapshot: nothing links a resident to an incident once it has ended;
--   * `crisis_alert_batches` is the audit that stays: who sent how many, when, and how many were
--     skipped and why. Counts only, no resident, like `contact_reveal_events`;
--   * `queue_crisis_alerts` (coordinator) picks the recipients. Only a resident who is on the
--     coordinator's list right now (matchable, not paused, with a skill visible in crises), has a
--     confirmed number, was not alerted in this crisis and has no open alert in another active
--     crisis is queued. An exercise queues nobody: it returns the counts a real send would have;
--   * the Worker's queue consumer sends each alert through three token-gated RPCs (see the phone
--     verification migration for the gate). `claim_crisis_alert` checks eligibility again, because
--     minutes may pass between queueing and sending.
--
-- An alert is OPEN while its crisis is active and its status is queued, sent or delivered,
-- whatever its answer. One resident has at most one open alert, so a bare "TAK" reply (Phase 4)
-- always means one crisis.
--
-- Additive only: the code on `master` and on `production` ignores every object created here.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.crisis_alerts (
  id uuid primary key default gen_random_uuid(),
  crisis_id uuid not null,
  user_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'undelivered', 'failed')),
  -- The resident's SMS reply (Phase 4). The last answer wins.
  answer text check (answer in ('yes', 'no')),
  answered_at timestamptz,
  -- The provider's message id, for delivery reports. Null until sent.
  provider_id text unique,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  status_at timestamptz not null default now(),
  unique (crisis_id, user_id),
  -- Ending the crisis or erasing the account deletes the snapshot row, and the alert with it.
  foreign key (crisis_id, user_id) references public.crisis_matches (crisis_id, user_id) on delete cascade
);

-- "Does this resident have an open alert?" at queue time, and reply routing in Phase 4.
create index crisis_alerts_user_id_idx on public.crisis_alerts (user_id);

alter table public.crisis_alerts enable row level security;
revoke all on public.crisis_alerts from public, anon, authenticated;

comment on table public.crisis_alerts is
  'One SMS alert per resident per active crisis (S-07): its delivery status and the reply. Deleted '
  'with the ranking snapshot when the crisis ends. No client can read or write it.';

-- `sent_by` has no FK to auth.users on purpose, like `activated_by`: the record outlives the account.
create table public.crisis_alert_batches (
  id bigint generated always as identity primary key,
  crisis_id uuid not null references public.crises (id),
  sent_by uuid not null,
  requested integer not null,
  queued integer not null,
  -- {"unverified": n, "no_phone": n, "paused": n, "hidden": n, "other_crisis": n}; zero counts left out.
  skipped jsonb not null default '{}'::jsonb,
  simulated boolean not null,
  created_at timestamptz not null default now()
);

create index crisis_alert_batches_crisis_id_idx on public.crisis_alert_batches (crisis_id);

alter table public.crisis_alert_batches enable row level security;
revoke all on public.crisis_alert_batches from public, anon, authenticated;

comment on table public.crisis_alert_batches is
  'Audit of alert batches (S-07): who sent how many and when, with skip counts. Outlives the crisis '
  'and carries no resident. Read through get_crisis_alert_summary.';

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------

-- What one SMS costs, for the estimate shown to the coordinator. The upper end of SMSAPI's price
-- range; the invoice is the truth.
create function private.sms_unit_cost_pln()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.17 $$;

revoke execute on function private.sms_unit_cost_pln() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- queue_crisis_alerts (coordinator)
-- ---------------------------------------------------------------------------

-- Queues an alert for the next p_count eligible people, in `position` order, who were not alerted
-- in this crisis yet. Returns the new alert ids for the Worker to put on the queue.
--   * p_count is clamped to 1..200 (null means 50), and a crisis takes at most 500 alerts in all;
--   * `skipped` counts the not-yet-alerted people passed over on the way to the last one queued
--     (or everyone not yet alerted, when fewer than p_count were eligible), by reason:
--     paused, hidden (not matchable now, or no skill visible in crises), no_phone, unverified,
--     other_crisis (an open alert in another active crisis);
--   * an exercise inserts nothing and takes no SMS budget: `simulated` is true and the counts are
--     what a real send would have done.
-- Raises: not_coordinator, unknown_crisis, crisis_not_active, alert_cap_reached,
-- sms_budget_exhausted.
create function public.queue_crisis_alerts(p_crisis_id uuid, p_count integer default 50)
returns table (
  alert_ids uuid[],
  queued integer,
  skipped jsonb,
  simulated boolean,
  estimated_cost_pln numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_exercise boolean;
  v_count integer := greatest(1, least(coalesce(p_count, 50), 200));
  v_crisis_cap constant integer := 500;
  v_already integer;
  v_ids uuid[];
  v_users uuid[];
  v_queued integer;
  v_last_position integer;
  v_skipped jsonb;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  -- One batch at a time, across all crises: two coordinators queueing in two crises at once could
  -- otherwise both pass the "no open alert elsewhere" check for the same resident.
  perform pg_advisory_xact_lock(hashtextextended('queue_crisis_alerts', 0));

  select c.status, c.is_exercise into v_status, v_exercise
  from public.crises c
  where c.id = p_crisis_id
  for share;
  if not found then
    raise exception 'unknown_crisis';
  end if;
  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  select count(*) into v_already from public.crisis_alerts a where a.crisis_id = p_crisis_id;
  if v_already >= v_crisis_cap then
    raise exception 'alert_cap_reached';
  end if;
  v_count := least(v_count, v_crisis_cap - v_already);

  -- Everyone on the snapshot who was not alerted in this crisis, with the reason they cannot be
  -- (null: eligible). The first matching reason wins, most fundamental first.
  create temp table _alert_candidates on commit drop as
  select
    m.user_id,
    m.position,
    case
      when public.pause_active(p.paused_at, p.paused_until, now()) then 'paused'
      when not public.profile_is_matchable(m.user_id)
        or public.crisis_visible_skills(m.user_id, m.matched_skills) is null then 'hidden'
      when pc.user_id is null then 'no_phone'
      when pc.phone_verified_at is null then 'unverified'
      when exists (
        select 1
        from public.crisis_alerts o
        join public.crises oc on oc.id = o.crisis_id
        where o.user_id = m.user_id
          and o.crisis_id <> p_crisis_id
          and oc.status = 'active'
          and o.status in ('queued', 'sent', 'delivered')
      ) then 'other_crisis'
    end as reason
  from public.crisis_matches m
  join public.profiles p on p.user_id = m.user_id
  left join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = p_crisis_id
    and not exists (
      select 1 from public.crisis_alerts a where a.crisis_id = p_crisis_id and a.user_id = m.user_id
    );

  select array_agg(t.user_id order by t.position), count(*)::integer, max(t.position)
  into v_users, v_queued, v_last_position
  from (
    select c.user_id, c.position
    from _alert_candidates c
    where c.reason is null
    order by c.position
    limit v_count
  ) as t;

  -- Fewer eligible people than asked for: the whole remaining list was walked.
  if v_queued < v_count then
    v_last_position := null;
  end if;

  select coalesce(jsonb_object_agg(s.reason, s.n), '{}'::jsonb) into v_skipped
  from (
    select c.reason, count(*) as n
    from _alert_candidates c
    where c.reason is not null
      and (v_last_position is null or c.position < v_last_position)
    group by c.reason
  ) as s;

  drop table _alert_candidates;

  if v_exercise then
    v_ids := '{}';
  elsif v_queued = 0 then
    v_ids := '{}';
  else
    -- Raises sms_budget_exhausted and queues nobody when today's budget cannot take the batch.
    perform private.take_sms_budget(v_queued);

    with inserted as (
      insert into public.crisis_alerts (crisis_id, user_id)
      select p_crisis_id, u from unnest(v_users) as u
      returning id
    )
    select array_agg(i.id) into v_ids from inserted i;
  end if;

  insert into public.crisis_alert_batches (crisis_id, sent_by, requested, queued, skipped, simulated)
  values (p_crisis_id, (select auth.uid()), v_count, v_queued, v_skipped, v_exercise);

  return query
  select v_ids, v_queued, v_skipped, v_exercise, round(v_queued * private.sms_unit_cost_pln(), 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_crisis_alert_summary (coordinator)
-- ---------------------------------------------------------------------------

-- The batches sent for a crisis, newest first, and how many alerts are in each status now.
-- Counts only, no resident, so reading it is not logged.
-- {"statuses": {"queued": n, …}, "batches": [{"created_at", "requested", "queued", "skipped",
--   "simulated", "estimated_cost_pln"}]}
create function public.get_crisis_alert_summary(p_crisis_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;
  if not exists (select 1 from public.crises c where c.id = p_crisis_id) then
    raise exception 'unknown_crisis';
  end if;

  return jsonb_build_object(
    'statuses', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (
        select a.status, count(*) as n
        from public.crisis_alerts a
        where a.crisis_id = p_crisis_id
        group by a.status
      ) as s
    ),
    'batches', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'created_at', b.created_at,
            'requested', b.requested,
            'queued', b.queued,
            'skipped', b.skipped,
            'simulated', b.simulated,
            'estimated_cost_pln', round(b.queued * private.sms_unit_cost_pln(), 2)
          )
          order by b.created_at desc, b.id desc
        ),
        '[]'::jsonb
      )
      from public.crisis_alert_batches b
      where b.crisis_id = p_crisis_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Token-gated RPCs for the queue consumer
-- ---------------------------------------------------------------------------

-- Hands the consumer what it needs to send one queued alert: the number and the crisis facts for
-- the text. Returns no row, and sends nothing, when the alert is gone (the crisis ended, the
-- account was erased) or is no longer queued. When the resident stopped being eligible since
-- queueing (paused, hid their skills, removed or changed the number), the alert is marked failed
-- and no row is returned.
create function public.claim_crisis_alert(p_token text, p_alert_id uuid)
returns table (phone text, crisis_type text, epicentre_postcode text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.crisis_alerts;
  v_phone text;
begin
  perform private.check_worker_token(p_token);

  select * into v_alert from public.crisis_alerts a where a.id = p_alert_id for update;
  if not found or v_alert.status <> 'queued' then
    return;
  end if;

  select pc.phone into v_phone
  from public.crisis_matches m
  join public.crises c on c.id = m.crisis_id
  join public.profiles p on p.user_id = m.user_id
  join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = v_alert.crisis_id
    and m.user_id = v_alert.user_id
    and c.status = 'active'
    and not c.is_exercise
    and pc.phone_verified_at is not null
    and not public.pause_active(p.paused_at, p.paused_until, now())
    and public.profile_is_matchable(m.user_id)
    and public.crisis_visible_skills(m.user_id, m.matched_skills) is not null;

  if v_phone is null then
    update public.crisis_alerts a set status = 'failed', status_at = now() where a.id = p_alert_id;
    return;
  end if;

  return query
  select v_phone, t.name_pl, c.epicentre_postcode
  from public.crises c
  join public.crisis_types t on t.slug = c.crisis_type_slug
  where c.id = v_alert.crisis_id;
end;
$$;

-- The provider took the message. p_provider_id is null when the provider reported a duplicate of an
-- alert it had already taken (a retry after a lost answer). Only a queued alert moves.
create function public.mark_crisis_alert_sent(p_token text, p_alert_id uuid, p_provider_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_worker_token(p_token);

  update public.crisis_alerts a
  set status = 'sent', provider_id = p_provider_id, sent_at = now(), status_at = now()
  where a.id = p_alert_id and a.status = 'queued';
end;
$$;

-- The message could not be sent (a fatal provider error, or the retries ran out). Only a queued
-- alert moves, so a late dead-letter message never downgrades one that was sent.
create function public.mark_crisis_alert_failed(p_token text, p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_worker_token(p_token);

  update public.crisis_alerts a
  set status = 'failed', status_at = now()
  where a.id = p_alert_id and a.status = 'queued';
end;
$$;

alter function public.queue_crisis_alerts(uuid, integer) owner to postgres;
alter function public.get_crisis_alert_summary(uuid) owner to postgres;
alter function public.claim_crisis_alert(text, uuid) owner to postgres;
alter function public.mark_crisis_alert_sent(text, uuid, text) owner to postgres;
alter function public.mark_crisis_alert_failed(text, uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- New functions are executable by PUBLIC by default. Coordinator RPCs go to `authenticated` (they
-- check the role themselves); the token-gated ones go to `anon`, which is how the Worker calls them.
revoke execute on function public.queue_crisis_alerts(uuid, integer) from public, anon;
revoke execute on function public.get_crisis_alert_summary(uuid) from public, anon;
grant execute on function public.queue_crisis_alerts(uuid, integer) to authenticated;
grant execute on function public.get_crisis_alert_summary(uuid) to authenticated;

revoke execute on function public.claim_crisis_alert(text, uuid) from public, authenticated;
revoke execute on function public.mark_crisis_alert_sent(text, uuid, text) from public, authenticated;
revoke execute on function public.mark_crisis_alert_failed(text, uuid) from public, authenticated;
grant execute on function public.claim_crisis_alert(text, uuid) to anon;
grant execute on function public.mark_crisis_alert_sent(text, uuid, text) to anon;
grant execute on function public.mark_crisis_alert_failed(text, uuid) to anon;

-- Crisis SMS alerts: replies, delivery reports and the ranking (roadmap S-07, Phase 4; FR-011, US-01).
--
-- Closes the loop the alerts migration opened:
--   * `record_sms_status` (token-gated) records a delivery report from the provider's webhook;
--   * `record_sms_reply` (token-gated) records a resident's TAK or NIE and tells the Worker whether
--     to send an auto-reply. The last answer wins. A reply maps to the sender's one open alert:
--     a verified number belongs to one account, and a resident has one open alert at a time;
--   * auto-replies are limited to one per number per hour and count against the daily SMS budget.
--     The limit is tracked by a peppered hash of the number, never the number;
--   * `get_crisis_matches` and `get_team_candidates` gain `alert_status` and `answer`, and list
--     people who answered TAK first, then people with no answer, then NIE. Inside each group the
--     snapshot's `position` order holds. The score is not touched: this is a read-time order;
--   * `get_crisis_alert_summary` also counts the answers.
--
-- Expand only: both list functions keep every existing column, so the code on `master` and on
-- `production` keeps working and ignores the new ones. Their return types change, so they are
-- dropped and recreated, which resets their privileges: each is re-granted below.

-- ---------------------------------------------------------------------------
-- Auto-reply limit
-- ---------------------------------------------------------------------------

create table private.sms_autoreply_log (
  -- Hex SHA-256 of the worker token and the number. Without the token (which the database never
  -- stores) the hash cannot be turned back into a number by trying all of them.
  phone_hash text primary key check (phone_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null default now()
);

alter table private.sms_autoreply_log enable row level security;
revoke all on private.sms_autoreply_log from public, anon, authenticated;

comment on table private.sms_autoreply_log is
  'Auto-replies of the last hour, by a peppered hash of the number (S-07 cost guard). Rows older '
  'than an hour are deleted on the next reply.';

-- Whether an auto-reply may go to p_phone now: at most one per number per hour, and only while
-- today's SMS budget has room. A true answer has already recorded the reply and taken the budget.
create function private.take_autoreply(p_token text, p_phone text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hash text := encode(sha256(convert_to(p_token || ':' || p_phone, 'UTF8')), 'hex');
begin
  delete from private.sms_autoreply_log l where l.sent_at <= now() - interval '1 hour';

  -- A refused budget rolls this block back, so the log row goes with it.
  begin
    insert into private.sms_autoreply_log (phone_hash) values (v_hash) on conflict do nothing;
    if not found then
      return false;
    end if;
    perform private.take_sms_budget(1);
    return true;
  exception
    when raise_exception then
      if sqlerrm = 'sms_budget_exhausted' then
        return false;
      end if;
      raise;
  end;
end;
$$;

revoke execute on function private.take_autoreply(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_sms_status (token-gated)
-- ---------------------------------------------------------------------------

-- Records a delivery report. p_status is the Worker's reading of the provider's status:
-- 'delivered', 'undelivered' or 'failed'. The alert is found by the provider's message id, or by
-- its own id (which the Worker sends to the provider as `idx`) when no provider id was recorded:
-- a retried send the provider refused as a duplicate, or a report that overtook
-- `mark_crisis_alert_sent`.
--   * idempotent: a repeated report changes nothing;
--   * `delivered` is never downgraded, and a late `delivered` wins over an earlier bad report;
--   * `undelivered` and `failed` only move an alert that is still queued or sent.
-- A report for an alert that is gone (the crisis ended) is dropped.
-- Raises: worker_token_unset, worker_token_invalid, invalid_status.
create function public.record_sms_status(p_token text, p_provider_id text, p_alert_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_worker_token(p_token);

  if p_status is null or p_status not in ('delivered', 'undelivered', 'failed') then
    raise exception 'invalid_status';
  end if;

  update public.crisis_alerts a
  set
    status = p_status,
    provider_id = coalesce(a.provider_id, p_provider_id),
    sent_at = case when p_status = 'failed' then a.sent_at else coalesce(a.sent_at, now()) end,
    status_at = now()
  where (
      a.provider_id = p_provider_id
      or (
        a.id = p_alert_id
        and a.provider_id is null
        and not exists (select 1 from public.crisis_alerts o where o.provider_id = p_provider_id)
      )
    )
    and (
      (p_status = 'delivered' and a.status <> 'delivered')
      or (p_status in ('undelivered', 'failed') and a.status in ('queued', 'sent'))
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_sms_reply (token-gated)
-- ---------------------------------------------------------------------------

-- Records a resident's SMS reply. p_phone is the sender as the provider gives it (`48…`, `+48…`,
-- `0048…` or nine digits); p_answer is the Worker's reading of the text: 'yes', 'no' or 'unclear'.
-- The text itself never reaches the database. Returns what the Worker should do:
--   * 'recorded': the answer is stored on the sender's open alert (the last answer wins);
--   * 'unclear': the sender has an open alert but the text was neither TAK nor NIE: ask again;
--   * 'ended': the sender has a verified number but no open alert: say the action is over;
--   * 'unclear_silent', 'ended_silent': as above, but send nothing (this number got an auto-reply
--     within the last hour, or today's SMS budget is used up);
--   * 'unknown': no verified profile has this number. Nothing is stored and nothing is sent, so a
--     stranger cannot make SkillNet pay for SMS.
-- An alert the provider reported as undelivered still takes the answer when the sender has no open
-- alert: the reply proves the message arrived.
-- Raises: worker_token_unset, worker_token_invalid, invalid_answer.
create function public.record_sms_reply(p_token text, p_phone text, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text;
  v_phone text;
  v_user uuid;
  v_alert uuid;
begin
  perform private.check_worker_token(p_token);

  if p_answer is null or p_answer not in ('yes', 'no', 'unclear') then
    raise exception 'invalid_answer';
  end if;

  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_digits := regexp_replace(v_digits, '^(0048|48)(?=\d{9}$)', '');
  if v_digits !~ '^\d{9}$' then
    return 'unknown';
  end if;
  v_phone := '+48' || v_digits;

  select pc.user_id into v_user
  from public.profile_contacts pc
  where pc.phone = v_phone and pc.phone_verified_at is not null;
  if not found then
    return 'unknown';
  end if;

  select a.id into v_alert
  from public.crisis_alerts a
  join public.crises c on c.id = a.crisis_id
  where a.user_id = v_user
    and c.status = 'active'
    and a.status in ('queued', 'sent', 'delivered', 'undelivered')
  order by (a.status = 'undelivered'), a.queued_at desc
  limit 1
  for update of a;

  if not found then
    return case when private.take_autoreply(p_token, v_phone) then 'ended' else 'ended_silent' end;
  end if;

  if p_answer = 'unclear' then
    return case when private.take_autoreply(p_token, v_phone) then 'unclear' else 'unclear_silent' end;
  end if;

  update public.crisis_alerts a
  set
    answer = p_answer,
    answered_at = now(),
    -- An answer proves the message arrived, whatever the delivery report said (or has yet to say).
    -- A queued alert stays queued, so the consumer still sends it.
    status = case when a.status in ('sent', 'undelivered') then 'delivered' else a.status end,
    status_at = case when a.status in ('sent', 'undelivered') then now() else a.status_at end
  where a.id = v_alert;

  return 'recorded';
end;
$$;

alter function public.record_sms_status(text, text, uuid, text) owner to postgres;
alter function public.record_sms_reply(text, text, text) owner to postgres;

revoke execute on function public.record_sms_status(text, text, uuid, text) from public, authenticated;
revoke execute on function public.record_sms_reply(text, text, text) from public, authenticated;
grant execute on function public.record_sms_status(text, text, uuid, text) to anon;
grant execute on function public.record_sms_reply(text, text, text) to anon;

-- ---------------------------------------------------------------------------
-- get_crisis_matches: alert status, answer, confirmed people first
-- ---------------------------------------------------------------------------

drop function public.get_crisis_matches(uuid, integer);

-- get_crisis_matches from 20261025120000, plus each person's alert in this crisis: its status
-- (null when no alert was sent) and the answer (null when there is none). People who answered TAK
-- come first, then people with no answer, then NIE; inside each group the snapshot order holds.
-- The limit applies after that order, so a TAK from far down the snapshot is still on the page.
create function public.get_crisis_matches(p_crisis_id uuid, p_limit integer default 200)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  matched_skills jsonb,
  has_phone boolean,
  availability_slots integer,
  available_now boolean,
  alert_status text,
  answer text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  if not exists (select 1 from public.crises c where c.id = p_crisis_id) then
    raise exception 'unknown_crisis';
  end if;

  return query
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    v.skills,
    pc.user_id is not null,
    a.slots,
    public.availability_covers(a.slots, now()),
    al.status,
    al.answer
  from public.crisis_matches m
  join public.profiles p on p.user_id = m.user_id
  cross join lateral (select public.crisis_visible_skills(m.user_id, m.matched_skills) as skills) v
  cross join lateral (select case when p.show_availability_in_crisis then p.availability_slots end as slots) a
  left join public.profile_contacts pc on pc.user_id = m.user_id
  left join public.crisis_alerts al on al.crisis_id = m.crisis_id and al.user_id = m.user_id
  where m.crisis_id = p_crisis_id
    and not public.pause_active(p.paused_at, p.paused_until, now())
    and v.skills is not null
  order by case al.answer when 'yes' then 0 when 'no' then 2 else 1 end, m.position
  limit greatest(0, least(coalesce(p_limit, 200), 200));

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'matches', v_count);
end;
$$;

alter function public.get_crisis_matches(uuid, integer) owner to postgres;
revoke execute on function public.get_crisis_matches(uuid, integer) from public, anon;
grant execute on function public.get_crisis_matches(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_team_candidates: the same columns and the same order
-- ---------------------------------------------------------------------------

drop function public.get_team_candidates(uuid, text, integer);

-- get_team_candidates from 20261019120000, with the list's new columns and order: the people kept
-- per role, and the rows returned, put TAK first, then no answer, then NIE, each in snapshot order.
create function public.get_team_candidates(p_crisis_id uuid, p_template text, p_teams integer)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  role_skills jsonb,
  has_phone boolean,
  availability_slots integer,
  available_now boolean,
  alert_status text,
  answer text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_slots integer;
  v_count integer;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  select c.status into v_status from public.crises c where c.id = p_crisis_id;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  select sum(r.slots) into v_slots from public.team_template_roles r where r.template_slug = p_template;
  if v_slots is null then
    raise exception 'unknown_template';
  end if;

  if p_teams is null or p_teams not between 1 and 10 then
    raise exception 'invalid_team_count';
  end if;

  return query
  with qualifying as (
    select
      m.user_id,
      m.position,
      case al.answer when 'yes' then 0 when 'no' then 2 else 1 end as answer_order,
      trs.role_slug,
      jsonb_agg(
        jsonb_build_object('slug', ps.skill_slug, 'level', ps.level)
        order by coalesce(ps.level, 2) desc, ps.skill_slug
      ) as skills
    from public.crisis_matches m
    join public.profiles pr on pr.user_id = m.user_id
    join public.profile_skills ps on ps.user_id = m.user_id and ps.use_in_crisis
    join public.team_role_skills trs
      on trs.skill_slug = ps.skill_slug
     and trs.template_slug = p_template
    left join public.crisis_alerts al on al.crisis_id = m.crisis_id and al.user_id = m.user_id
    where m.crisis_id = p_crisis_id
      and not public.pause_active(pr.paused_at, pr.paused_until, now())
      and public.crisis_visible_skills(m.user_id, m.matched_skills) is not null
    group by m.user_id, m.position, al.answer, trs.role_slug
  ),
  bounded as (
    select
      q.*,
      row_number() over (partition by q.role_slug order by q.answer_order, q.position) as role_rn
    from qualifying q
  ),
  kept as (
    select b.user_id, jsonb_object_agg(b.role_slug, b.skills) as role_skills
    from bounded b
    where b.role_rn <= p_teams * v_slots
    group by b.user_id
  )
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    k.role_skills,
    pc.user_id is not null,
    a.slots,
    public.availability_covers(a.slots, now()),
    al.status,
    al.answer
  from kept k
  join public.crisis_matches m on m.crisis_id = p_crisis_id and m.user_id = k.user_id
  left join public.profiles p on p.user_id = m.user_id
  cross join lateral (select case when p.show_availability_in_crisis then p.availability_slots end as slots) a
  left join public.profile_contacts pc on pc.user_id = m.user_id
  left join public.crisis_alerts al on al.crisis_id = m.crisis_id and al.user_id = m.user_id
  order by case al.answer when 'yes' then 0 when 'no' then 2 else 1 end, m.position;

  get diagnostics v_count = row_count;

  insert into public.crisis_list_views (crisis_id, viewed_by, list, returned_count)
  values (p_crisis_id, (select auth.uid()), 'teams', v_count);
end;
$$;

alter function public.get_team_candidates(uuid, text, integer) owner to postgres;
revoke execute on function public.get_team_candidates(uuid, text, integer) from public, anon;
grant execute on function public.get_team_candidates(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_crisis_alert_summary: also the answers
-- ---------------------------------------------------------------------------

-- get_crisis_alert_summary from 20261030130000, plus "answers": {"yes": n, "no": n} (zero counts
-- left out). The list shows at most 200 people; these counts cover every alert of the crisis.
-- Same signature and return type, so the privileges stay.
create or replace function public.get_crisis_alert_summary(p_crisis_id uuid)
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
    'answers', (
      select coalesce(jsonb_object_agg(s.answer, s.n), '{}'::jsonb)
      from (
        select a.answer, count(*) as n
        from public.crisis_alerts a
        where a.crisis_id = p_crisis_id and a.answer is not null
        group by a.answer
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

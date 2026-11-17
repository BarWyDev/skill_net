-- Phone verification (roadmap S-07, Phase 2; FR-011).
--
-- A crisis SMS may go only to a number its owner has proved they hold: a typo must never text a
-- stranger, and a reply must map to exactly one resident. This migration adds the server path
-- that sets `profile_contacts.phone_verified_at`, which until now nothing could set:
--   * the Worker makes a 6-digit code, sends it by SMS and stores only a hash of it; the resident
--     types the code back, and the Worker checks it. Both steps are RPCs gated by a worker token;
--   * the Worker holds no service key. The token-gated functions are `security definer`, callable
--     by `anon`, and useless without the token: each one hashes `p_token` with SHA-256 and compares
--     it with `private.worker_tokens`. The plain token exists only as the Worker secret
--     `SMS_WORKER_TOKEN`. Until an operator inserts the hash, every call raises `worker_token_unset`;
--   * `private` is a new schema PostgREST does not expose (`supabase/config.toml` `schemas`), with
--     no client privileges, for state no client may ever read or call directly;
--   * one daily SMS budget (`private.take_sms_budget`) covers every outgoing message: codes now,
--     alerts and auto-replies in the later phases;
--   * a verified number belongs to one account (partial unique index), so an SMS reply can be
--     routed by its sender alone.
--
-- Additive only: the code on `master` and on `production` ignores every object created here.

-- ---------------------------------------------------------------------------
-- The private schema
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

comment on schema private is
  'Server-only state (S-07). Not exposed by PostgREST; clients hold no privileges here.';

-- ---------------------------------------------------------------------------
-- Worker tokens
-- ---------------------------------------------------------------------------

create table private.worker_tokens (
  name text primary key,
  -- Hex SHA-256 of the plain token. The plain token is never stored.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table private.worker_tokens enable row level security;
revoke all on private.worker_tokens from public, anon, authenticated;

comment on table private.worker_tokens is
  'SHA-256 hashes of the tokens that open the token-gated RPCs (S-07). An operator inserts the row '
  'for ''sms_worker''; migrations and seeds never do, so no environment shares a known token.';

-- Raises unless p_token is the SMS worker's token. Called first by every token-gated RPC.
create function private.check_worker_token(p_token text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hash text;
begin
  select t.token_hash into v_hash from private.worker_tokens t where t.name = 'sms_worker';
  if v_hash is null then
    raise exception 'worker_token_unset';
  end if;
  -- Hashes are compared, so the comparison's timing says nothing about the token itself.
  if p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> v_hash then
    raise exception 'worker_token_invalid';
  end if;
end;
$$;

revoke execute on function private.check_worker_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The daily SMS budget
-- ---------------------------------------------------------------------------

create table private.sms_daily_usage (
  day date primary key,
  sent integer not null check (sent >= 0)
);

alter table private.sms_daily_usage enable row level security;
revoke all on private.sms_daily_usage from public, anon, authenticated;

comment on table private.sms_daily_usage is
  'Outgoing SMS counted per Europe/Warsaw day (S-07 cost guard). A count only, no recipients.';

-- The ceiling for every outgoing SMS in one day: codes, alerts and auto-replies together.
create function private.sms_daily_budget()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1000 $$;

revoke execute on function private.sms_daily_budget() from public, anon, authenticated;

-- Takes p_count messages from today's budget, or raises `sms_budget_exhausted` and takes nothing
-- (the exception rolls the increment back with the caller's transaction).
create function private.take_sms_budget(p_count integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Warsaw')::date;
  v_sent integer;
begin
  if p_count is null or p_count < 0 then
    raise exception 'invalid_sms_count';
  end if;
  if p_count = 0 then
    return;
  end if;

  insert into private.sms_daily_usage as u (day, sent)
  values (v_day, p_count)
  on conflict (day) do update set sent = u.sent + excluded.sent
  returning u.sent into v_sent;

  if v_sent > private.sms_daily_budget() then
    raise exception 'sms_budget_exhausted';
  end if;
end;
$$;

revoke execute on function private.take_sms_budget(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pending codes
-- ---------------------------------------------------------------------------

-- One row per resident. The row outlives a used or expired code (its code fields are cleared), so
-- the hourly send limit cannot be reset by confirming, or by removing and re-adding the number.
-- Erasing the account removes it through the profile, like the number itself.
create table public.phone_verification_codes (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  -- The number the code was sent to. Verification succeeds only while it is still the current one.
  phone text,
  -- Hex SHA-256 made by the Worker from its token, the user id and the code. Never the code.
  code_hash text check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  -- The hourly send limit: how many codes were sent since window_started_at.
  window_started_at timestamptz not null default now(),
  window_sends integer not null default 0 check (window_sends >= 0)
);

-- RLS with no policies and no grants: only the definer functions below touch this table.
alter table public.phone_verification_codes enable row level security;
revoke all on public.phone_verification_codes from public, anon, authenticated;

comment on table public.phone_verification_codes is
  'Pending phone verification codes (S-07): a hash, an expiry and the send and attempt counters. '
  'No client can read or write it.';

-- A verified number belongs to one account, so an SMS reply maps to one resident.
create unique index profile_contacts_verified_phone_key
  on public.profile_contacts (phone)
  where phone_verified_at is not null;

-- ---------------------------------------------------------------------------
-- Token-gated RPCs
-- ---------------------------------------------------------------------------

-- Starts a verification: stores the code's hash and returns the number to send the code to.
-- The Worker calls it before sending, so a refused call costs no SMS.
-- Raises: worker_token_unset, worker_token_invalid, invalid_code_hash, no_phone, already_verified,
-- phone_taken, rate_limited (3 codes per hour), sms_budget_exhausted.
create function public.begin_phone_verification(p_token text, p_user_id uuid, p_code_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_verified_at timestamptz;
  v_window_started_at timestamptz;
  v_window_sends integer;
begin
  perform private.check_worker_token(p_token);

  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_code_hash';
  end if;

  select c.phone, c.phone_verified_at into v_phone, v_verified_at
  from public.profile_contacts c
  where c.user_id = p_user_id
  for update;

  if v_phone is null then
    raise exception 'no_phone';
  end if;
  if v_verified_at is not null then
    raise exception 'already_verified';
  end if;
  if exists (
    select 1 from public.profile_contacts o
    where o.phone = v_phone and o.phone_verified_at is not null and o.user_id <> p_user_id
  ) then
    raise exception 'phone_taken';
  end if;

  select v.window_started_at, v.window_sends into v_window_started_at, v_window_sends
  from public.phone_verification_codes v
  where v.user_id = p_user_id
  for update;

  if v_window_started_at is null or v_window_started_at <= now() - interval '1 hour' then
    v_window_started_at := now();
    v_window_sends := 0;
  end if;
  if v_window_sends >= 3 then
    raise exception 'rate_limited';
  end if;

  perform private.take_sms_budget(1);

  insert into public.phone_verification_codes as v
    (user_id, phone, code_hash, expires_at, attempts, sent_at, window_started_at, window_sends)
  values
    (p_user_id, v_phone, p_code_hash, now() + interval '10 minutes', 0, now(), v_window_started_at, v_window_sends + 1)
  on conflict (user_id) do update set
    phone = excluded.phone,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    sent_at = excluded.sent_at,
    window_started_at = excluded.window_started_at,
    window_sends = excluded.window_sends;

  return v_phone;
end;
$$;

-- Checks a code. True: the number is now verified. False: wrong code, and the attempt is counted
-- (a raise would roll the count back, so a wrong code is a result, not an error).
-- Raises: worker_token_unset, worker_token_invalid, expired (no pending code, a code past its
-- 10 minutes, or the number changed since the code was sent), too_many_attempts (after 5 wrong
-- codes), phone_taken.
create function public.confirm_phone_verification(p_token text, p_user_id uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.phone_verification_codes;
  v_phone text;
begin
  perform private.check_worker_token(p_token);

  select * into v_code
  from public.phone_verification_codes v
  where v.user_id = p_user_id
  for update;

  if v_code.code_hash is null or v_code.expires_at is null or v_code.expires_at <= now() then
    raise exception 'expired';
  end if;
  if v_code.attempts >= 5 then
    raise exception 'too_many_attempts';
  end if;

  if p_code_hash is null or p_code_hash <> v_code.code_hash then
    update public.phone_verification_codes v set attempts = v.attempts + 1 where v.user_id = p_user_id;
    return false;
  end if;

  select c.phone into v_phone
  from public.profile_contacts c
  where c.user_id = p_user_id
  for update;

  -- The number was removed or changed after the code went out: that code proves nothing now.
  if v_phone is null or v_phone <> v_code.phone then
    raise exception 'expired';
  end if;

  begin
    update public.profile_contacts c set phone_verified_at = now() where c.user_id = p_user_id;
  exception when unique_violation then
    -- Another account verified the same number first (profile_contacts_verified_phone_key).
    raise exception 'phone_taken';
  end;

  -- The code is used up. The row stays for the hourly send limit.
  update public.phone_verification_codes v
  set code_hash = null, expires_at = null, phone = null, attempts = 0
  where v.user_id = p_user_id;

  return true;
end;
$$;

alter function public.begin_phone_verification(text, uuid, text) owner to postgres;
alter function public.confirm_phone_verification(text, uuid, text) owner to postgres;

-- New functions are executable by PUBLIC by default. The Worker calls these as `anon` (publishable
-- key, no session), and a signed-in client has no business calling them at all.
revoke execute on function public.begin_phone_verification(text, uuid, text) from public, authenticated;
revoke execute on function public.confirm_phone_verification(text, uuid, text) from public, authenticated;
grant execute on function public.begin_phone_verification(text, uuid, text) to anon;
grant execute on function public.confirm_phone_verification(text, uuid, text) to anon;

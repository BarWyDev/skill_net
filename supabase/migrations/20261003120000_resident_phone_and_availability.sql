-- Resident phone and availability (roadmap S-06, FR-004, FR-005).
--
-- The phone is the most sensitive field in the product. S-07 (SMS), S-08 (operational list) and
-- S-09 (break-glass reveal) will read it later; this migration builds the boundary they inherit:
--   * the phone lives in its own table, `profile_contacts`, which only its owner can read or
--     write; no RPC returns another resident's number;
--   * `phone_verified_at` is not writable by the owner (column-level grants), and any change of
--     the number resets it, so only a future server-side verification path (S-07) can set it;
--   * the table accepts `+48` plus 9 digits; `save_my_profile` also requires a Polish mobile
--     prefix (4–8), which the seed's `+48000…` numbers never have;
--   * declared availability (`profiles.availability_slots`) is information for the coordinator
--     only. It never enters the score, the ranking order or eligibility; `availability_score`
--     stays the S-07 YES confirmation;
--   * `get_crisis_matches` exposes phone presence and availability, never the number.
--
-- Availability encoding (mirrored in src/lib/availability.ts): a 28-bit mask, bit index =
-- (isodow - 1) * 4 + floor(hour / 6) on the Europe/Warsaw clock. Slots are noc 0–6, rano 6–12,
-- popołudnie 12–18, wieczór 18–24; a slot includes its start and excludes its end. Monday noc is
-- bit 0, Sunday wieczór is bit 27. `null` means "not declared"; 0 is never stored.

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

create table public.profile_contacts (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  phone text not null check (phone ~ '^\+48\d{9}$'),
  phone_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column availability_slots integer
  constraint profiles_availability_slots_range check (availability_slots between 1 and 268435455);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A new or changed number is unverified, whoever writes it.
create function public.profile_contacts_reset_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profile_contacts_reset_verification
before insert or update on public.profile_contacts
for each row execute function public.profile_contacts_reset_verification();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Whether an availability mask covers the Warsaw-clock slot of p_at. Null when not declared.
create function public.availability_covers(p_slots integer, p_at timestamptz)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_slots >> ((extract(isodow from l)::integer - 1) * 4 + extract(hour from l)::integer / 6)) & 1 = 1
  from (select p_at at time zone 'Europe/Warsaw' as l) as local_time
$$;

-- The signature changes, so the old 5-argument version must go: `create or replace` would leave
-- it callable as a second overload.
drop function public.save_my_profile(text, text, double precision, double precision, jsonb);

-- Writes the caller's location, whole skill set, phone and availability in one transaction.
-- p_skills: [{"slug": text, "level": int | null}]. p_phone: normalised `+48XXXXXXXXX`, or
-- null / '' to remove it. p_availability_slots: the mask above; null or 0 means not declared.
--
-- Every location write goes through UPDATE, so the location trigger can see `old` (see
-- 20260927150000_profile_postcode_never_stored.sql).
create function public.save_my_profile(
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_skills jsonb,
  p_phone text,
  p_availability_slots integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set location_source = p_location_source,
      postcode = case when p_location_source = 'postcode' then p_postcode end,
      location = case
        when p_location_source = 'pin' and p_lat is not null and p_lng is not null
          then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      end,
      availability_slots = nullif(p_availability_slots, 0)
  where user_id = v_user_id;

  delete from public.profile_skills where user_id = v_user_id;

  insert into public.profile_skills (user_id, skill_slug, level)
  select v_user_id, e ->> 'slug', (e ->> 'level')::smallint
  from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) as e;

  if nullif(p_phone, '') is null then
    delete from public.profile_contacts where user_id = v_user_id;
  else
    if p_phone !~ '^\+48[4-8]\d{8}$' then
      raise exception 'invalid_phone';
    end if;

    -- An unchanged number keeps its verification; a changed one is reset by the trigger.
    insert into public.profile_contacts (user_id, phone) values (v_user_id, p_phone)
    on conflict (user_id) do update set phone = excluded.phone;
  end if;
end;
$$;

-- The caller's profile, or an empty profile when there is no row yet. No postcode. The phone is
-- the caller's own.
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'location_source', p.location_source,
    'lat', extensions.st_y(p.location::extensions.geometry),
    'lng', extensions.st_x(p.location::extensions.geometry),
    'skills', coalesce(
      (
        select jsonb_agg(jsonb_build_object('slug', s.skill_slug, 'level', s.level) order by s.skill_slug)
        from public.profile_skills s
        where s.user_id = me.user_id
      ),
      '[]'::jsonb
    ),
    'matchable', public.profile_is_matchable(me.user_id),
    'phone', c.phone,
    'phone_verified', c.phone_verified_at is not null,
    'availability_slots', p.availability_slots
  )
  from (select auth.uid() as user_id) as me
  left join public.profiles p on p.user_id = me.user_id
  left join public.profile_contacts c on c.user_id = me.user_id
$$;

-- The return type changes, so the function must be dropped and re-created.
drop function public.get_crisis_matches(uuid, integer);

-- The display-ready ranked list of a crisis, in `position` order: no user_id, no score, no phone,
-- and the distance rounded to 0.5 km inside the database. Order and skills come from the
-- activation snapshot; `has_phone` and availability are read from the current profiles, and
-- `available_now` is evaluated at the time of the call (null when not declared).
create function public.get_crisis_matches(p_crisis_id uuid, p_limit integer default 200)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  matched_skills jsonb,
  has_phone boolean,
  availability_slots integer,
  available_now boolean
)
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

  return query
  select
    m.rank,
    m.position,
    round(m.distance_m / 500.0) * 0.5,
    m.matched_skills,
    pc.user_id is not null,
    p.availability_slots,
    public.availability_covers(p.availability_slots, now())
  from public.crisis_matches m
  left join public.profiles p on p.user_id = m.user_id
  left join public.profile_contacts pc on pc.user_id = m.user_id
  where m.crisis_id = p_crisis_id
  order by m.position
  limit p_limit;
end;
$$;

alter function public.get_crisis_matches(uuid, integer) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profile_contacts enable row level security;

-- Owner only. Nobody else, coordinators included, reads a number through the table.
create policy "profile_contacts: owner can read" on public.profile_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profile_contacts: owner can insert" on public.profile_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profile_contacts: owner can update" on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "profile_contacts: owner can delete" on public.profile_contacts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. The owner may write
-- the number only: `phone_verified_at` and `updated_at` are not theirs to set.
revoke all on public.profile_contacts from anon;
revoke insert, update, truncate, references, trigger on public.profile_contacts from authenticated;
grant insert (user_id, phone) on public.profile_contacts to authenticated;
grant update (phone) on public.profile_contacts to authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default.
revoke execute on function public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer) from public, anon;
revoke execute on function public.get_crisis_matches(uuid, integer) from public, anon;
grant execute on function public.save_my_profile(text, text, double precision, double precision, jsonb, text, integer) to authenticated;
grant execute on function public.get_crisis_matches(uuid, integer) to authenticated;
grant execute on function public.availability_covers(integer, timestamptz) to anon, authenticated;

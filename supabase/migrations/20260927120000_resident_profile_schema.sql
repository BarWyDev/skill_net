-- Resident skills profile (roadmap S-01, FR-002, FR-003).
--
-- First domain schema. Every privacy and eligibility guarantee lives here, so any write
-- path (the save RPC, a direct PostgREST request allowed by RLS, an admin script) gets it:
--   * no stored location is more precise than the centre of a 500 m cell in EPSG:2180;
--   * a postcode location is always resolved from the local `postcodes` table;
--   * a resident reads and writes only their own profile rows;
--   * `profile_is_matchable` is the single eligibility rule the crisis ranking (S-03) reuses.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.skill_categories (
  slug text primary key,
  name_pl text not null,
  sort smallint not null
);

create table public.skills (
  slug text primary key,
  category_slug text not null references public.skill_categories (slug),
  name_pl text not null,
  has_level boolean not null,
  sort smallint not null
);

create index skills_category_slug_idx on public.skills (category_slug);

-- Raw centroids of every Polish postcode. Reference data, not personal data.
create table public.postcodes (
  postcode text primary key check (postcode ~ '^\d{2}-\d{3}$'),
  centroid extensions.geography(Point, 4326) not null,
  address_count integer not null
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  postcode text,
  location_source text check (location_source in ('postcode', 'pin')),
  location extensions.geography(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_location_matches_source check ((location_source is null) = (location is null)),
  constraint profiles_postcode_source_has_postcode check (location_source <> 'postcode' or postcode is not null),
  constraint profiles_pin_source_has_no_postcode check (location_source <> 'pin' or postcode is null)
);

create index profiles_location_idx on public.profiles using gist (location);

create table public.profile_skills (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  skill_slug text not null references public.skills (slug),
  level smallint check (level between 1 and 3),
  primary key (user_id, skill_slug)
);

-- S-03 filters residents by skill.
create index profile_skills_skill_slug_idx on public.profile_skills (skill_slug);

-- ---------------------------------------------------------------------------
-- Coarsening
-- ---------------------------------------------------------------------------

-- Snaps a point to the centre of its 500 m cell in EPSG:2180 (Poland's metric CS).
-- Cell centres make two points in one cell identical, and keep the result within
-- about 354 m of the input. Idempotent: a cell centre maps to itself.
create function public.coarsen_point(p extensions.geography)
returns extensions.geography
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.st_transform(
           extensions.st_setsrid(
             extensions.st_makepoint(
               floor(extensions.st_x(g) / 500) * 500 + 250,
               floor(extensions.st_y(g) / 500) * 500 + 250
             ),
             2180
           ),
           4326
         )::extensions.geography
  from (select extensions.st_transform(p::extensions.geometry, 2180) as g) as projected
  where p is not null
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.profiles_resolve_and_coarsen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_point extensions.geometry;
begin
  if new.location_source = 'postcode' then
    select centroid into new.location from public.postcodes where postcode = new.postcode;
    if new.location is null then
      raise exception 'unknown_postcode';
    end if;
  elsif new.location_source = 'pin' then
    new.postcode := null;
    if new.location is not null then
      v_point := new.location::extensions.geometry;
      if extensions.st_y(v_point) not between 49.0 and 54.9
         or extensions.st_x(v_point) not between 14.1 and 24.2 then
        raise exception 'outside_poland';
      end if;
    end if;
  else
    new.location := null;
    new.postcode := null;
  end if;

  new.location := public.coarsen_point(new.location);
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_resolve_and_coarsen
before insert or update on public.profiles
for each row execute function public.profiles_resolve_and_coarsen();

create function public.profile_skills_check_level()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_has_level boolean;
begin
  select has_level into v_has_level from public.skills where slug = new.skill_slug;
  if not found then
    -- Unknown skill: the foreign key reports it (23503).
    return new;
  end if;

  if v_has_level and new.level is null then
    raise exception 'level_required';
  end if;
  if not v_has_level and new.level is not null then
    raise exception 'level_not_applicable';
  end if;
  return new;
end;
$$;

create trigger profile_skills_check_level
before insert or update on public.profile_skills
for each row execute function public.profile_skills_check_level();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Eligibility contract for S-03: a location and at least one skill.
-- Security invoker: under RLS a resident only ever sees their own rows, so calling it for
-- someone else returns false. S-03's ranking RPC must be security definer (owned by the
-- table owner) to evaluate it for other residents.
create function public.profile_is_matchable(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.location is not null
      and exists (select 1 from public.profile_skills s where s.user_id = p.user_id)
  )
$$;

-- Writes the caller's location and whole skill set in one transaction.
-- p_skills: [{"slug": text, "level": int | null}]
create function public.save_my_profile(
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_skills jsonb
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

  insert into public.profiles (user_id, location_source, postcode, location)
  values (
    v_user_id,
    p_location_source,
    case when p_location_source = 'postcode' then p_postcode end,
    case
      when p_location_source = 'pin' and p_lat is not null and p_lng is not null
        then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    end
  )
  on conflict (user_id) do update
    set location_source = excluded.location_source,
        postcode = excluded.postcode,
        location = excluded.location;

  delete from public.profile_skills where user_id = v_user_id;

  insert into public.profile_skills (user_id, skill_slug, level)
  select v_user_id, e ->> 'slug', (e ->> 'level')::smallint
  from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) as e;
end;
$$;

-- The caller's profile, or an empty profile when there is no row yet.
create function public.get_my_profile()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'postcode', p.postcode,
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
    'matchable', public.profile_is_matchable(me.user_id)
  )
  from (select auth.uid() as user_id) as me
  left join public.profiles p on p.user_id = me.user_id
$$;

-- The coarsened centroid of a postcode, as it would be stored in a profile.
create function public.lookup_postcode(p_postcode text)
returns table (lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select extensions.st_y(c::extensions.geometry), extensions.st_x(c::extensions.geometry)
  from (
    select public.coarsen_point(centroid) as c
    from public.postcodes
    where postcode = p_postcode
  ) as coarsened
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.skill_categories enable row level security;
alter table public.skills enable row level security;
alter table public.postcodes enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_skills enable row level security;

-- Reference data: readable by everyone, writable only by migrations.
create policy "skill_categories: anon can read" on public.skill_categories
  for select to anon using (true);
create policy "skill_categories: authenticated can read" on public.skill_categories
  for select to authenticated using (true);

create policy "skills: anon can read" on public.skills
  for select to anon using (true);
create policy "skills: authenticated can read" on public.skills
  for select to authenticated using (true);

create policy "postcodes: anon can read" on public.postcodes
  for select to anon using (true);
create policy "postcodes: authenticated can read" on public.postcodes
  for select to authenticated using (true);

-- Profiles: owner only.
create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles: owner can insert" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "profiles: owner can delete" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "profile_skills: owner can read" on public.profile_skills
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profile_skills: owner can insert" on public.profile_skills
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profile_skills: owner can update" on public.profile_skills
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "profile_skills: owner can delete" on public.profile_skills
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.save_my_profile(text, text, double precision, double precision, jsonb) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.profile_is_matchable(uuid) from public, anon;
grant execute on function public.save_my_profile(text, text, double precision, double precision, jsonb) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.profile_is_matchable(uuid) to authenticated;
grant execute on function public.lookup_postcode(text) to anon, authenticated;

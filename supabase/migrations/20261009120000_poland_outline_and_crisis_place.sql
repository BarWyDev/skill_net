-- Poland outline check and the crisis place label (manual QA findings QA-024, QA-026).
--
-- QA-024: "in Poland" was a lat/lng bounding box, so pins in Czechia, Slovakia, Lithuania,
-- Belarus, Ukraine and the Kaliningrad oblast passed. `is_in_poland` checks a simplified outline
-- instead: ~107 vertices drawn a few kilometres outside the real border (and offshore), so it errs
-- towards accepting. Every postcode centroid lies inside. The same ring lives in src/lib/poland.ts
-- for the client-side check; change both together. A postcode location is never checked: it comes
-- from the `postcodes` table.
--
-- QA-026: two crises of the same type and radius looked identical in the panel. A crisis now
-- stores the postcode of its epicentre: the typed one, or the nearest one to a pin. The epicentre
-- is not personal data (see the crisis matching migration), so neither is its nearest postcode.
--
-- Expand only: a new function, a new nullable column, and two replaced function bodies. The code
-- that reads `epicentre_postcode` must ship after this migration is pushed.

create function public.is_in_poland(p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.st_contains(
    extensions.st_geomfromtext(
      'POLYGON((14.20 54.00,14.80 54.10,15.60 54.25,16.40 54.50,16.90 54.66,17.60 54.83,18.35 54.90,18.90 54.66,19.64 54.48,19.95 54.425,20.65 54.375,21.30 54.345,22.00 54.36,22.79 54.37,23.10 54.33,23.40 54.25,23.53 54.12,23.53 53.95,23.62 53.75,23.72 53.52,23.95 53.25,23.95 53.10,24.00 52.75,23.75 52.60,23.40 52.42,23.20 52.30,23.66 52.08,23.68 51.90,23.66 51.60,23.75 51.30,23.95 51.00,24.17 50.87,24.10 50.62,24.05 50.50,23.60 50.22,23.00 49.82,22.70 49.45,22.75 49.30,22.89 48.98,22.56 49.07,22.20 49.16,22.05 49.24,21.90 49.36,21.68 49.42,21.25 49.38,20.95 49.30,20.80 49.30,20.55 49.37,20.20 49.25,20.08 49.165,19.82 49.20,19.80 49.40,19.58 49.40,19.47 49.58,19.20 49.42,18.97 49.47,18.82 49.51,18.82 49.64,18.62 49.73,18.56 49.90,18.32 49.915,18.20 49.97,18.05 50.00,17.85 50.03,17.60 50.18,17.40 50.28,17.10 50.40,16.95 50.45,17.00 50.30,16.90 50.18,16.70 50.09,16.62 50.13,16.45 50.25,16.33 50.38,16.20 50.42,16.20 50.47,16.35 50.50,16.43 50.58,16.35 50.65,16.20 50.64,16.00 50.66,15.74 50.72,15.40 50.80,15.28 50.86,15.27 50.98,15.00 51.01,15.02 50.88,14.95 50.85,14.82 50.87,14.99 51.12,14.97 51.20,14.80 51.40,14.72 51.55,14.65 51.70,14.66 51.85,14.70 51.95,14.60 52.10,14.55 52.33,14.62 52.58,14.15 52.85,14.38 53.05,14.40 53.30,14.35 53.45,14.28 53.55,14.26 53.70,14.22 53.87,14.20 54.00))',
      4326
    ),
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
  );
$$;

comment on function public.is_in_poland(double precision, double precision) is
  'Simplified outline of Poland, generous by a few km. Same ring as src/lib/poland.ts.';

-- The profile trigger from the postcode minimisation migration, with the outline check.
create or replace function public.profiles_resolve_and_coarsen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_point extensions.geometry;
begin
  if new.location_source = 'postcode' then
    if new.postcode is not null then
      select centroid into new.location from public.postcodes where postcode = new.postcode;
      if new.location is null then
        raise exception 'unknown_postcode';
      end if;
    elsif tg_op = 'UPDATE' and old.location_source = 'postcode' then
      -- No code sent: keep the stored point, whatever location the caller supplied.
      new.location := old.location;
    else
      raise exception 'postcode_required';
    end if;
  elsif new.location_source = 'pin' then
    if new.location is not null then
      v_point := new.location::extensions.geometry;
      if not public.is_in_poland(extensions.st_y(v_point), extensions.st_x(v_point)) then
        raise exception 'outside_poland';
      end if;
    end if;
  else
    new.location := null;
  end if;

  new.postcode := null;
  new.location := public.coarsen_point(new.location);
  new.updated_at := now();
  return new;
end;
$$;

alter table public.crises add column epicentre_postcode text;

comment on column public.crises.epicentre_postcode is
  'The typed postcode, or the postcode nearest to a pinned epicentre. A label for the panel only.';

-- Existing crises: the postcode nearest to the epicentre.
update public.crises c
set epicentre_postcode = (
  select p.postcode
  from public.postcodes p
  order by extensions.st_distance(p.centroid, c.epicentre), p.postcode
  limit 1
)
where c.epicentre_postcode is null;

-- activate_crisis from the crisis matching migration, with the outline check and the label.
-- Everything else, the ranking included, is unchanged.
create or replace function public.activate_crisis(
  p_crisis_type text,
  p_location_source text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.crisis_types%rowtype;
  v_radius_m integer;
  v_epicentre extensions.geography;
  v_crisis_id uuid;
  v_count integer;
  v_postcode text;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  select * into v_type from public.crisis_types where slug = p_crisis_type;
  if not found then
    raise exception 'unknown_crisis_type';
  end if;

  if p_radius_km is null or p_radius_km not in (1, 2, 5, 10, 20) then
    raise exception 'invalid_radius';
  end if;
  v_radius_m := p_radius_km * 1000;

  if p_location_source = 'postcode' and p_postcode is not null then
    -- The raw centroid: the epicentre is not personal data.
    select centroid into v_epicentre from public.postcodes where postcode = p_postcode;
    if v_epicentre is null then
      raise exception 'unknown_postcode';
    end if;
    v_postcode := p_postcode;
  elsif p_location_source = 'pin' and p_lat is not null and p_lng is not null then
    -- The same outline as the profile trigger.
    if not public.is_in_poland(p_lat, p_lng) then
      raise exception 'outside_poland';
    end if;
    v_epicentre := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
    select postcode into v_postcode
    from public.postcodes
    order by extensions.st_distance(centroid, v_epicentre), postcode
    limit 1;
  else
    raise exception 'location_required';
  end if;

  insert into public.crises (crisis_type_slug, epicentre, epicentre_postcode, radius_m, activated_by)
  values (v_type.slug, v_epicentre, v_postcode, v_radius_m, (select auth.uid()))
  returning id into v_crisis_id;

  insert into public.crisis_matches (crisis_id, user_id, rank, position, score, distance_m, matched_skills)
  -- Materialized so the radius filter on the GIST-indexed location drives the query; the
  -- planner would otherwise start from a scan over all of profile_skills.
  with candidates as materialized (
    select p.user_id, extensions.st_distance(p.location, v_epicentre)::numeric as d
    from public.profiles p
    where extensions.st_dwithin(p.location, v_epicentre, v_radius_m)
  ),
  matched as (
    select
      c.user_id,
      c.d,
      ps.skill_slug,
      cts.tier,
      ps.level,
      case cts.tier when 'priority' then 1.0 else 0.5 end as tier_value,
      coalesce(ps.level, 2)::numeric / 3 as level_value
    from candidates c
    join public.profile_skills ps on ps.user_id = c.user_id
    join public.crisis_type_skills cts
      on cts.skill_slug = ps.skill_slug
     and cts.crisis_type_slug = v_type.slug
  ),
  -- One row per resident. Every aggregate orders the matched skills best first.
  per_user as (
    select
      m.user_id,
      min(m.d) as d,
      count(*) as match_n,
      (array_agg(m.tier_value order by m.tier_value desc, m.level_value desc, m.skill_slug))[1] as best_tier,
      (array_agg(m.level_value order by m.tier_value desc, m.level_value desc, m.skill_slug))[1] as best_level,
      jsonb_agg(
        jsonb_build_object('slug', m.skill_slug, 'tier', m.tier, 'level', m.level)
        order by m.tier_value desc, m.level_value desc, m.skill_slug
      ) as matched_skills
    from matched m
    group by m.user_id
    having public.profile_is_matchable(m.user_id)
  ),
  scored as (
    select
      u.user_id,
      u.d,
      u.matched_skills,
      round(
        v_type.w_distance * (1 - u.d / v_radius_m)
        + v_type.w_skill * (u.best_tier + least(0.10, 0.05 * (u.match_n - 1))) / 1.10
        + v_type.w_level * u.best_level
        + v_type.w_availability * 0,
        6
      ) as score
    from per_user u
  )
  select
    v_crisis_id,
    s.user_id,
    rank() over (order by s.score desc),
    row_number() over (order by s.score desc, md5(v_crisis_id::text || s.user_id::text)),
    s.score,
    round(s.d)::integer,
    s.matched_skills
  from scored s;

  get diagnostics v_count = row_count;

  update public.crises set match_count = v_count where id = v_crisis_id;

  return v_crisis_id;
end;
$$;

-- Profile postcode minimisation (roadmap S-15, FR-003; S-01 review F1).
--
-- Supersedes the S-01 header claim: a stored postcode could identify a building (981 postcodes
-- cover a single address), so the typed postcode is no longer stored. From here on:
--   * `profiles.postcode` is a write-only input. The trigger resolves it to the coarsened
--     centroid and then discards it; `check (postcode is null)` makes that a table invariant;
--   * a postcode-source write without a code keeps the previously stored point (skills-only
--     re-save), and never accepts a caller-supplied point;
--   * `get_my_profile` no longer returns a postcode.

alter table public.profiles
  drop constraint profiles_postcode_source_has_postcode,
  drop constraint profiles_pin_source_has_no_postcode;

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
      if extensions.st_y(v_point) not between 49.0 and 54.9
         or extensions.st_x(v_point) not between 14.1 and 24.2 then
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

-- Existing rows: the trigger's keep branch preserves each point and source.
update public.profiles set postcode = null where postcode is not null;

alter table public.profiles
  add constraint profiles_postcode_never_stored check (postcode is null);

comment on column public.profiles.postcode is
  'Write-only input: the profiles_resolve_and_coarsen trigger resolves it to a coarsened centroid and sets it to null. Never stored.';

-- Every location write goes through UPDATE, so the trigger can see `old`. An upsert would not
-- work: ON CONFLICT DO UPDATE sees `excluded` after the BEFORE INSERT trigger has already
-- nulled the postcode, and a keep-save would raise in the insert trigger.
create or replace function public.save_my_profile(
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

  insert into public.profiles (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
  set location_source = p_location_source,
      postcode = case when p_location_source = 'postcode' then p_postcode end,
      location = case
        when p_location_source = 'pin' and p_lat is not null and p_lng is not null
          then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      end
  where user_id = v_user_id;

  delete from public.profile_skills where user_id = v_user_id;

  insert into public.profile_skills (user_id, skill_slug, level)
  select v_user_id, e ->> 'slug', (e ->> 'level')::smallint
  from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) as e;
end;
$$;

-- The caller's profile, or an empty profile when there is no row yet. No postcode.
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
    'matchable', public.profile_is_matchable(me.user_id)
  )
  from (select auth.uid() as user_id) as me
  left join public.profiles p on p.user_id = me.user_id
$$;

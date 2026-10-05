-- Public skills-density map (roadmap S-11, FR-008).
--
-- The only read path from resident data to anonymous visitors. Every privacy guarantee lives in
-- this function, so the API, the page and a direct PostgREST call all get the same ones:
--   * residents are grouped into fixed 2 km squares in EPSG:2180. 2000 is a multiple of the
--     500 m coarsening grid, so every stored cell centre falls inside exactly one square;
--   * a square counts distinct matchable residents (`profile_is_matchable`), or, with a category,
--     distinct matchable residents who have at least one skill in it, never skill rows;
--   * squares with fewer than 5 residents are dropped before banding, so they look exactly like
--     empty squares;
--   * the rest leave as a band only: 1 for 5-9, 2 for 10-24, 3 for 25 or more residents;
--   * no count, user id or sub-square coordinate is ever returned.

create function public.get_skills_density(p_category text default null)
returns table (cell jsonb, band smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_category is not null
     and not exists (select 1 from public.skill_categories c where c.slug = p_category) then
    raise exception 'unknown_category';
  end if;

  return query
  with eligible as (
    select
      p.user_id,
      extensions.st_transform(p.location::extensions.geometry, 2180) as g
    from public.profiles p
    where public.profile_is_matchable(p.user_id)
      and (
        p_category is null
        or exists (
          select 1
          from public.profile_skills ps
          join public.skills s on s.slug = ps.skill_slug
          where ps.user_id = p.user_id
            and s.category_slug = p_category
        )
      )
  ),
  -- Suppression happens here, inside the aggregate: a square under 5 people never gets a band.
  squares as (
    select
      floor(extensions.st_x(e.g) / 2000)::integer as sx,
      floor(extensions.st_y(e.g) / 2000)::integer as sy,
      count(distinct e.user_id) as n
    from eligible e
    group by 1, 2
    having count(distinct e.user_id) >= 5
  )
  select
    extensions.st_asgeojson(
      extensions.st_transform(
        extensions.st_makeenvelope(q.sx * 2000, q.sy * 2000, (q.sx + 1) * 2000, (q.sy + 1) * 2000, 2180),
        4326
      ),
      6
    )::jsonb,
    (case when q.n >= 25 then 3 when q.n >= 10 then 2 else 1 end)::smallint
  from squares q
  order by q.sx, q.sy;
end;
$$;

alter function public.get_skills_density(text) owner to postgres;

revoke execute on function public.get_skills_density(text) from public;
grant execute on function public.get_skills_density(text) to anon, authenticated;

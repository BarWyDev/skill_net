-- Skill coverage of an active crisis.
--
-- For every skill in the crisis type's matrix, how many people on the crisis list have it, and how
-- many of them are available now. The coordinator sees at once which priority skills nobody in the
-- radius has, without reading the list (which shows only its first page).
--
-- The counts come from exactly the rows `get_crisis_matches` shows: the snapshot, minus paused
-- residents, with `matched_skills` reduced by `crisis_visible_skills` (S-12 V2). "Available now"
-- counts only residents who share their availability in a crisis (S-12 V3), as on the list. Counts
-- are not personal data and add nothing the list does not show, so reading them is not logged in
-- `crisis_list_views`. An ended crisis has no snapshot, so it has no coverage.

create function public.get_crisis_coverage(p_crisis_id uuid)
returns table (skill_slug text, tier text, people integer, available_now integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_type text;
begin
  if not public.is_coordinator() then
    raise exception 'not_coordinator';
  end if;

  select c.status, c.crisis_type_slug into v_status, v_type from public.crises c where c.id = p_crisis_id;
  if not found then
    raise exception 'unknown_crisis';
  end if;

  if v_status <> 'active' then
    raise exception 'crisis_not_active';
  end if;

  return query
  with visible as materialized (
    select
      v.skills,
      p.show_availability_in_crisis and coalesce(public.availability_covers(p.availability_slots, now()), false) as now_ok
    from public.crisis_matches m
    join public.profiles p on p.user_id = m.user_id
    cross join lateral (select public.crisis_visible_skills(m.user_id, m.matched_skills) as skills) v
    where m.crisis_id = p_crisis_id
      and not public.pause_active(p.paused_at, p.paused_until, now())
      and v.skills is not null
  )
  select
    cts.skill_slug,
    cts.tier,
    count(vis.skills)::integer,
    count(vis.skills) filter (where vis.now_ok)::integer
  from public.crisis_type_skills cts
  join public.skills s on s.slug = cts.skill_slug
  left join visible vis on vis.skills @> jsonb_build_array(jsonb_build_object('slug', cts.skill_slug))
  where cts.crisis_type_slug = v_type
  group by cts.skill_slug, cts.tier, s.sort
  order by cts.tier = 'priority' desc, s.sort, cts.skill_slug;
end;
$$;

alter function public.get_crisis_coverage(uuid) owner to postgres;

revoke execute on function public.get_crisis_coverage(uuid) from public, anon;
grant execute on function public.get_crisis_coverage(uuid) to authenticated;

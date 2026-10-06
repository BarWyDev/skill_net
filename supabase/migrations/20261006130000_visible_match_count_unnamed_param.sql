-- `visible_match_count` with an unnamed parameter.
--
-- `supabase gen types` recognises a PostgREST computed column only when the function's single
-- parameter is unnamed. With `p_crisis` the generated types rejected `visible_match_count` in a
-- `crises` select, and the app had to override the row type. Postgres cannot rename a parameter
-- with `create or replace`, so the function is dropped and recreated in this transaction. The body,
-- owner, grants and behaviour are unchanged from 20261006120000_pause_availability.sql.

drop function public.visible_match_count(public.crises);

-- PostgREST computed column `visible_match_count` on `crises`: the number of people a coordinator
-- sees in an active crisis's list (snapshot rows whose resident is not paused; erased residents
-- are already gone from the snapshot), or the frozen `match_count` of an ended crisis. 0 for
-- anyone who is not a coordinator.
create function public.visible_match_count(public.crises)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_crisis alias for $1;
begin
  if not public.is_coordinator() then
    return 0;
  end if;

  if v_crisis.status <> 'active' then
    return v_crisis.match_count;
  end if;

  return (
    select count(*)::integer
    from public.crisis_matches m
    join public.profiles p on p.user_id = m.user_id
    where m.crisis_id = v_crisis.id
      and not public.pause_active(p.paused_at, p.paused_until, now())
  );
end;
$$;

alter function public.visible_match_count(public.crises) owner to postgres;

revoke execute on function public.visible_match_count(public.crises) from public, anon;
grant execute on function public.visible_match_count(public.crises) to authenticated;

-- Crisis team templates (roadmap S-10, FR-014).
--
-- Template reference data and the only path from a crisis snapshot to role eligibility. The
-- database decides who may be considered and what they qualify for; the app arranges them into
-- teams. Every access guarantee lives here, so the app layer cannot weaken it:
--   * only a coordinator (`is_coordinator()`) reads team candidates, enforced inside the
--     security-definer RPC as well as by the app's route gate;
--   * only an active crisis has candidates: an ended crisis raises, even though its snapshot is
--     already gone;
--   * only members of the crisis's snapshot (`crisis_matches`) are considered; a resident in the
--     radius with no matrix skill is never on a team;
--   * role eligibility comes from the members' current `profile_skills`, not from the snapshot's
--     `matched_skills` (which holds matrix skills only), so a skill removed after activation no
--     longer qualifies anyone;
--   * per role, only the first `p_teams × S` qualifying members by `position` are returned
--     (S = the template's slots per team). The bound is exact: a slot filled from outside a
--     role's top `p_teams × S` can always be swapped for an unused member inside it, with no loss
--     of fill and no higher cost. It also keeps the payload to at most 10 × 4 × 3 rows;
--   * no `user_id`, score or raw distance leaves the database, as in `get_crisis_matches`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Reference data: one row per template. Templates change only by migration.
create table public.team_templates (
  slug text primary key,
  name_pl text not null,
  sort smallint not null
);

-- Reference data: the roles of a template, and how many people each needs per team.
create table public.team_template_roles (
  template_slug text not null references public.team_templates (slug),
  role_slug text not null,
  name_pl text not null,
  slots smallint not null check (slots between 1 and 3),
  sort smallint not null,
  primary key (template_slug, role_slug)
);

-- Reference data: which skills qualify a person for a role.
create table public.team_role_skills (
  template_slug text not null,
  role_slug text not null,
  skill_slug text not null references public.skills (slug),
  primary key (template_slug, role_slug, skill_slug),
  foreign key (template_slug, role_slug) references public.team_template_roles (template_slug, role_slug)
);

create index team_role_skills_skill_slug_idx on public.team_role_skills (skill_slug);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- The team candidates of an active crisis for one template, in `position` order.
-- role_skills: {"<role_slug>": [{"slug": text, "level": int | null}], …}, holding only the roles
-- for which the member is within that role's bound, each listing the qualifying skills best
-- level first (no level counts as 2, as in the ranking), then by slug. Distance, phone and
-- availability are computed exactly as in `get_crisis_matches`.
create function public.get_team_candidates(p_crisis_id uuid, p_template text, p_teams integer)
returns table (
  rank integer,
  "position" integer,
  distance_km_rounded numeric,
  role_skills jsonb,
  has_phone boolean,
  availability_slots integer,
  available_now boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_slots integer;
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
      trs.role_slug,
      jsonb_agg(
        jsonb_build_object('slug', ps.skill_slug, 'level', ps.level)
        order by coalesce(ps.level, 2) desc, ps.skill_slug
      ) as skills
    from public.crisis_matches m
    join public.profile_skills ps on ps.user_id = m.user_id
    join public.team_role_skills trs
      on trs.skill_slug = ps.skill_slug
     and trs.template_slug = p_template
    where m.crisis_id = p_crisis_id
    group by m.user_id, m.position, trs.role_slug
  ),
  bounded as (
    select q.*, row_number() over (partition by q.role_slug order by q.position) as role_rn
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
    p.availability_slots,
    public.availability_covers(p.availability_slots, now())
  from kept k
  join public.crisis_matches m on m.crisis_id = p_crisis_id and m.user_id = k.user_id
  left join public.profiles p on p.user_id = m.user_id
  left join public.profile_contacts pc on pc.user_id = m.user_id
  order by m.position;
end;
$$;

alter function public.get_team_candidates(uuid, text, integer) owner to postgres;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.team_templates enable row level security;
alter table public.team_template_roles enable row level security;
alter table public.team_role_skills enable row level security;

-- Reference data: readable by everyone, writable only by migrations.
create policy "team_templates: anon can read" on public.team_templates
  for select to anon using (true);
create policy "team_templates: authenticated can read" on public.team_templates
  for select to authenticated using (true);

create policy "team_template_roles: anon can read" on public.team_template_roles
  for select to anon using (true);
create policy "team_template_roles: authenticated can read" on public.team_template_roles
  for select to authenticated using (true);

create policy "team_role_skills: anon can read" on public.team_role_skills
  for select to anon using (true);
create policy "team_role_skills: authenticated can read" on public.team_role_skills
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to anon and authenticated by default. RLS already blocks
-- these writes; revoking them as well makes them fail with permission denied.
revoke insert, update, delete, truncate, references, trigger on public.team_templates from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.team_template_roles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.team_role_skills from anon, authenticated;

-- Supabase also grants execute on new functions to anon and authenticated by default.
revoke execute on function public.get_team_candidates(uuid, text, integer) from public, anon;
grant execute on function public.get_team_candidates(uuid, text, integer) to authenticated;

-- Local demo data (roadmap S-03): about 500 synthetic residents around Kraków.
--
-- LOCAL ONLY. `npx supabase db reset` loads this file after the migrations; `supabase db push`
-- never runs seeds, so production never sees it. `setseed` makes every reset produce the same
-- residents, so the demo and the performance check are reproducible.
--   * accounts use `@seed.skillnet.test` emails and have no password, so nobody can sign in;
--   * pins lie within about 15 km of the 31-001 centroid and go through the profile trigger,
--     so they are coarsened like real ones;
--   * each resident has 1–4 distinct skills, with a level only where the skill has one;
--   * no coordinator is created: grant the role to your own local account (see README).

select setseed(0.42);

create temp table seed_residents on commit drop as
select
  i,
  md5('skillnet-seed-' || i)::uuid as user_id,
  15000 * sqrt(random()) as r,
  2 * pi() * random() as theta,
  1 + floor(random() * 4)::integer as skill_count
from generate_series(1, 500) as i;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  'mieszkaniec-' || lpad(i::text, 3, '0') || '@seed.skillnet.test',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', ''
from seed_residents
on conflict (id) do nothing;

-- 31-001 centroid in EPSG:2180: (567095.1, 243737.0).
insert into public.profiles (user_id, location_source, location)
select
  user_id,
  'pin',
  extensions.st_transform(
    extensions.st_setsrid(
      extensions.st_makepoint(567095.1 + r * cos(theta), 243737.0 + r * sin(theta)),
      2180
    ),
    4326
  )::extensions.geography
from seed_residents
on conflict (user_id) do nothing;

insert into public.profile_skills (user_id, skill_slug, level)
select
  s.user_id,
  k.slug,
  case when k.has_level then 1 + floor(random() * 3)::smallint end
from seed_residents s
cross join lateral (
  select sk.slug, sk.has_level
  from public.skills sk
  order by random() + 0 * s.i, sk.slug
  limit s.skill_count
) as k
on conflict (user_id, skill_slug) do nothing;

-- "Kto widział mój numer" and an updated notice (security audit F-11, docs/security-audit.md).
--
-- Every break-glass reveal is logged (`contact_reveal_events`, `contact_reveal_subjects`), and the
-- privacy notice says so, but a resident had no way to see the reveals of their own number.
-- `get_my_number_reveals` returns them to the resident: when, in which kind of crisis and around
-- which postcode. Never the coordinator, the coordinator's reason or anyone else's data: the reason
-- is the coordinator's free text and may name other people.
--
-- The privacy notice now names its processors (Supabase, Cloudflare, OpenStreetMap tiles) and
-- describes the audit records exactly, so a new consent version is published here. A newer version
-- only re-asks in the app (the consent gate); it never removes anyone from matching (see the
-- sign-up consent migration). Push this migration before deploying the code that sends it.
--
-- Expand only: one inserted row and one new function.

insert into public.consent_versions (version) values ('2026-10-10');

-- The caller's reveals, newest first. Only rows whose subject is the caller; a reveal that did not
-- return their number (no phone, paused) has no subject row and is not theirs to see.
create function public.get_my_number_reveals()
returns table (revealed_at timestamptz, crisis_type text, epicentre_postcode text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.occurred_at, t.name_pl, c.epicentre_postcode
  from public.contact_reveal_subjects s
  join public.contact_reveal_events e on e.id = s.event_id
  join public.crises c on c.id = e.crisis_id
  join public.crisis_types t on t.slug = c.crisis_type_slug
  where s.user_id = (select auth.uid())
  order by e.occurred_at desc, e.id desc
$$;

alter function public.get_my_number_reveals() owner to postgres;

-- Supabase grants execute on new functions to anon and authenticated by default.
revoke execute on function public.get_my_number_reveals() from public, anon;
grant execute on function public.get_my_number_reveals() to authenticated;

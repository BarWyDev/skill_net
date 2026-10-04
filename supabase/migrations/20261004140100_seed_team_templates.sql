-- Crisis team templates (roadmap S-10), mapped from docs/shape_not.md:103-112.
--
-- Templates change only by migration (coordinator-defined templates are out of scope). Every
-- template is usable in every crisis type.
--
-- Mapping rules, as in the crisis matrix: "medyk" = ratownik-medyczny, lekarz, pielegniarka,
-- pierwsza-pomoc (a first-aid course counts, with no minimum level); "kierowca" and "kierowca z
-- pojazdem" = kierowca-kat-b, kierowca-kat-c (a licence counts, there is no own-vehicle skill);
-- "osoba z narzędziami" = narzedzia-reczne, pila-lancuchowa; "medyk/opiekun" = the medic skills
-- plus opiekun-osob-starszych; "wolontariusz z lokalem" = lokal-ogrzewany-klimatyzowany;
-- "medyk/ratownik" in the medical point = the medic skills.

insert into public.team_templates (slug, name_pl, sort) values
  ('ewakuacyjny', 'Zespół ewakuacyjny', 1),
  ('techniczny', 'Zespół techniczny', 2),
  ('opiekunczy', 'Zespół opiekuńczy (upały/mrozy)', 3),
  ('punkt-medyczny', 'Punkt medyczny', 4);

insert into public.team_template_roles (template_slug, role_slug, name_pl, slots, sort) values
  ('ewakuacyjny', 'medyk', 'Medyk', 1, 1),
  ('ewakuacyjny', 'osoba-silna', 'Osoba silna fizycznie', 1, 2),
  ('ewakuacyjny', 'kierowca', 'Kierowca z pojazdem', 1, 3),

  ('techniczny', 'elektryk', 'Elektryk', 1, 1),
  ('techniczny', 'narzedzia', 'Osoba z narzędziami', 1, 2),
  ('techniczny', 'kierowca', 'Kierowca', 1, 3),

  ('opiekunczy', 'medyk-opiekun', 'Medyk lub opiekun', 1, 1),
  ('opiekunczy', 'kierowca', 'Kierowca', 1, 2),
  ('opiekunczy', 'lokal', 'Wolontariusz z lokalem', 1, 3),

  ('punkt-medyczny', 'medyk', 'Medyk lub ratownik', 2, 1),
  ('punkt-medyczny', 'logistyk', 'Logistyk', 1, 2);

insert into public.team_role_skills (template_slug, role_slug, skill_slug) values
  ('ewakuacyjny', 'medyk', 'ratownik-medyczny'),
  ('ewakuacyjny', 'medyk', 'lekarz'),
  ('ewakuacyjny', 'medyk', 'pielegniarka'),
  ('ewakuacyjny', 'medyk', 'pierwsza-pomoc'),
  ('ewakuacyjny', 'osoba-silna', 'osoba-silna-fizycznie'),
  ('ewakuacyjny', 'kierowca', 'kierowca-kat-b'),
  ('ewakuacyjny', 'kierowca', 'kierowca-kat-c'),

  ('techniczny', 'elektryk', 'elektryk'),
  ('techniczny', 'narzedzia', 'narzedzia-reczne'),
  ('techniczny', 'narzedzia', 'pila-lancuchowa'),
  ('techniczny', 'kierowca', 'kierowca-kat-b'),
  ('techniczny', 'kierowca', 'kierowca-kat-c'),

  ('opiekunczy', 'medyk-opiekun', 'ratownik-medyczny'),
  ('opiekunczy', 'medyk-opiekun', 'lekarz'),
  ('opiekunczy', 'medyk-opiekun', 'pielegniarka'),
  ('opiekunczy', 'medyk-opiekun', 'pierwsza-pomoc'),
  ('opiekunczy', 'medyk-opiekun', 'opiekun-osob-starszych'),
  ('opiekunczy', 'kierowca', 'kierowca-kat-b'),
  ('opiekunczy', 'kierowca', 'kierowca-kat-c'),
  ('opiekunczy', 'lokal', 'lokal-ogrzewany-klimatyzowany'),

  ('punkt-medyczny', 'medyk', 'ratownik-medyczny'),
  ('punkt-medyczny', 'medyk', 'lekarz'),
  ('punkt-medyczny', 'medyk', 'pielegniarka'),
  ('punkt-medyczny', 'medyk', 'pierwsza-pomoc'),
  ('punkt-medyczny', 'logistyk', 'logistyk');

-- Crisis matrix and ranking weights (roadmap S-03), mapped from docs/shape_not.md:70-77.
--
-- The weights are provisional and owned by the product owner: tune them after the pilot. They
-- change only by migration (editing them in the product, FR-018, is nice-to-have). Invariant
-- for every type: one level step on the best skill outweighs the maximum multi-skill bonus,
-- i.e. w_skill * 0.10 / 1.10 < w_level / 3. The availability weight is reserved for S-07.
--
-- Mapping rules: "medyk" = ratownik-medyczny, lekarz, pielegniarka, pierwsza-pomoc;
-- "kierowca" = kierowca-kat-b, kierowca-kat-c; in a flood, "kierowca (łódź/samochód terenowy)"
-- = sternik, lodz, samochod-terenowy; "tłumacz" = all four language skills; a skill named in
-- both columns is a priority skill. No type matches rezerwista, zolnierz-wot or
-- osoba-silna-fizycznie in v1.

insert into public.crisis_types (slug, name_pl, sort, w_distance, w_skill, w_level, w_availability) values
  ('powodz', 'Powódź', 1, 0.45, 0.25, 0.10, 0.20),
  ('awaria-pradu', 'Awaria prądu', 2, 0.30, 0.35, 0.15, 0.20),
  ('wypadek-masowy', 'Wypadek masowy', 3, 0.20, 0.40, 0.20, 0.20),
  ('pozar', 'Pożar', 4, 0.40, 0.25, 0.15, 0.20),
  ('upaly-mroz', 'Upały / mróz', 5, 0.30, 0.30, 0.20, 0.20),
  ('cyberatak-blackout', 'Cyberatak / blackout', 6, 0.20, 0.40, 0.20, 0.20);

insert into public.crisis_type_skills (crisis_type_slug, skill_slug, tier) values
  ('powodz', 'ratownik-wodny', 'priority'),
  ('powodz', 'sternik', 'priority'),
  ('powodz', 'lodz', 'priority'),
  ('powodz', 'samochod-terenowy', 'priority'),
  ('powodz', 'pompa', 'priority'),
  ('powodz', 'agregat-pradotworczy', 'priority'),
  ('powodz', 'elektryk', 'supporting'),
  ('powodz', 'ratownik-medyczny', 'supporting'),
  ('powodz', 'lekarz', 'supporting'),
  ('powodz', 'pielegniarka', 'supporting'),
  ('powodz', 'pierwsza-pomoc', 'supporting'),
  ('powodz', 'logistyk', 'supporting'),
  ('powodz', 'pila-lancuchowa', 'supporting'),

  ('awaria-pradu', 'elektryk', 'priority'),
  ('awaria-pradu', 'agregat-pradotworczy', 'priority'),
  ('awaria-pradu', 'kierowca-kat-b', 'supporting'),
  ('awaria-pradu', 'kierowca-kat-c', 'supporting'),
  ('awaria-pradu', 'logistyk', 'supporting'),
  ('awaria-pradu', 'ups-magazyn-energii', 'supporting'),

  ('wypadek-masowy', 'ratownik-medyczny', 'priority'),
  ('wypadek-masowy', 'lekarz', 'priority'),
  ('wypadek-masowy', 'pielegniarka', 'priority'),
  ('wypadek-masowy', 'pierwsza-pomoc', 'priority'),
  ('wypadek-masowy', 'kierowca-kat-b', 'supporting'),
  ('wypadek-masowy', 'kierowca-kat-c', 'supporting'),
  ('wypadek-masowy', 'psycholog', 'supporting'),
  ('wypadek-masowy', 'tlumacz-angielski', 'supporting'),
  ('wypadek-masowy', 'tlumacz-ukrainski', 'supporting'),
  ('wypadek-masowy', 'tlumacz-niemiecki', 'supporting'),
  ('wypadek-masowy', 'tlumacz-migowy', 'supporting'),

  ('pozar', 'strazak-osp', 'priority'),
  ('pozar', 'kierowca-kat-b', 'priority'),
  ('pozar', 'kierowca-kat-c', 'priority'),
  ('pozar', 'ratownik-medyczny', 'supporting'),
  ('pozar', 'lekarz', 'supporting'),
  ('pozar', 'pielegniarka', 'supporting'),
  ('pozar', 'pierwsza-pomoc', 'supporting'),
  ('pozar', 'pila-lancuchowa', 'supporting'),
  ('pozar', 'narzedzia-reczne', 'supporting'),

  ('upaly-mroz', 'ratownik-medyczny', 'priority'),
  ('upaly-mroz', 'lekarz', 'priority'),
  ('upaly-mroz', 'pielegniarka', 'priority'),
  ('upaly-mroz', 'pierwsza-pomoc', 'priority'),
  ('upaly-mroz', 'opiekun-osob-starszych', 'priority'),
  ('upaly-mroz', 'kierowca-kat-b', 'supporting'),
  ('upaly-mroz', 'kierowca-kat-c', 'supporting'),
  ('upaly-mroz', 'lokal-ogrzewany-klimatyzowany', 'supporting'),

  ('cyberatak-blackout', 'informatyk', 'priority'),
  ('cyberatak-blackout', 'elektryk', 'priority'),
  ('cyberatak-blackout', 'radioamator', 'priority'),
  ('cyberatak-blackout', 'logistyk', 'supporting'),
  ('cyberatak-blackout', 'agregat-pradotworczy', 'supporting'),
  ('cyberatak-blackout', 'kierowca-kat-b', 'supporting'),
  ('cyberatak-blackout', 'kierowca-kat-c', 'supporting');

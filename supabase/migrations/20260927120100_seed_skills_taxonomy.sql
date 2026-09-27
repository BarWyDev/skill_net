-- Fixed skills taxonomy (FR-002). Slugs are stable identifiers that S-03 matches on;
-- Polish names are display-only. The taxonomy changes only by migration.
-- Equipment and "osoba silna fizycznie" carry no level; every other skill has a level of 1–3.

insert into public.skill_categories (slug, name_pl, sort) values
  ('medyczne', 'Medyczne', 1),
  ('techniczne', 'Techniczne', 2),
  ('logistyczne', 'Logistyczne', 3),
  ('jezykowe', 'Językowe', 4),
  ('wojskowe', 'Wojskowe / rezerwa', 5),
  ('sprzet', 'Narzędzia i sprzęt', 6);

insert into public.skills (slug, category_slug, name_pl, has_level, sort) values
  ('ratownik-medyczny', 'medyczne', 'Ratownik medyczny', true, 1),
  ('lekarz', 'medyczne', 'Lekarz', true, 2),
  ('pielegniarka', 'medyczne', 'Pielęgniarka / pielęgniarz', true, 3),
  ('pierwsza-pomoc', 'medyczne', 'Kurs pierwszej pomocy', true, 4),
  ('ratownik-wodny', 'medyczne', 'Ratownik wodny', true, 5),
  ('psycholog', 'medyczne', 'Psycholog', true, 6),
  ('opiekun-osob-starszych', 'medyczne', 'Opiekun osób starszych', true, 7),

  ('elektryk', 'techniczne', 'Elektryk', true, 1),
  ('informatyk', 'techniczne', 'Informatyk', true, 2),
  ('radioamator', 'techniczne', 'Radioamator', true, 3),

  ('kierowca-kat-b', 'logistyczne', 'Kierowca kat. B', true, 1),
  ('kierowca-kat-c', 'logistyczne', 'Kierowca kat. C', true, 2),
  ('sternik', 'logistyczne', 'Sternik (łódź)', true, 3),
  ('logistyk', 'logistyczne', 'Logistyk', true, 4),
  ('osoba-silna-fizycznie', 'logistyczne', 'Osoba silna fizycznie', false, 5),

  ('tlumacz-angielski', 'jezykowe', 'Język angielski', true, 1),
  ('tlumacz-ukrainski', 'jezykowe', 'Język ukraiński', true, 2),
  ('tlumacz-niemiecki', 'jezykowe', 'Język niemiecki', true, 3),
  ('tlumacz-migowy', 'jezykowe', 'Polski język migowy', true, 4),

  ('rezerwista', 'wojskowe', 'Rezerwista', true, 1),
  ('zolnierz-wot', 'wojskowe', 'Żołnierz WOT', true, 2),
  ('strazak-osp', 'wojskowe', 'Strażak / OSP', true, 3),

  ('agregat-pradotworczy', 'sprzet', 'Agregat prądotwórczy', false, 1),
  ('ups-magazyn-energii', 'sprzet', 'UPS / magazyn energii', false, 2),
  ('pompa', 'sprzet', 'Pompa do wody', false, 3),
  ('pila-lancuchowa', 'sprzet', 'Piła łańcuchowa', false, 4),
  ('narzedzia-reczne', 'sprzet', 'Narzędzia ręczne (siekiera, łom)', false, 5),
  ('lodz', 'sprzet', 'Łódź / ponton', false, 6),
  ('samochod-terenowy', 'sprzet', 'Samochód terenowy', false, 7),
  ('lokal-ogrzewany-klimatyzowany', 'sprzet', 'Lokal ogrzewany / klimatyzowany', false, 8);

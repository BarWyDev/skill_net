# S-12: propozycja macierzy widoczności danych (FR-006)

2026-10-19 · **zaakceptowana przez właściciela 2026-10-19: rekomendacje D1–D8 przyjęte bez zmian.** Odblokowuje S-12 (roadmap: „Planning can't start until the visibility matrix is defined”).

## 1. Stan faktyczny: kto dziś widzi co

Ustalone na podstawie migracji do `20261011130000` i `/prywatnosc` (wersja zgody `2026-10-10`).

| Dane mieszkańca                          | Tryb codzienny                                                          | Tryb kryzysowy (koordynator)                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| E-mail                                   | nikt                                                                    | nikt                                                                                                                  |
| Imię / pseudonim                         | nie istnieje w schemacie                                                | nie istnieje                                                                                                          |
| Lokalizacja (środek kwadratu 500 m)      | nikt indywidualnie; wlicza się do mapy gęstości (2 km, k ≥ 5/10, szum)  | tylko odległość zaokrąglona do 0,5 km (`distance_km_rounded`)                                                         |
| Umiejętności i poziom                    | wliczają się do mapy (kategoria)                                        | tylko dopasowane do typu kryzysu (`matched_skills`: slug, tier, level), na liście, w zespołach i przy odsłonięciu      |
| Dostępność (dni/pory)                    | nikt                                                                    | maska slotów + „dostępny teraz”                                                                                       |
| Telefon                                  | nikt (tylko właściciel)                                                 | lista pokazuje tylko „ma telefon”; numer wyłącznie przez break-glass (z powodem, logowane, widoczne dla mieszkańca)  |
| Przerwa (S-13)                           | nikt; osoba wypada z mapy                                               | nikt; osoba znika z listy bez śladu                                                                                   |

Wniosek: **w trybie codziennym nikt nie widzi żadnej konkretnej osoby**, a jedyną formą „widoczności” jest wkład do zagregowanej mapy. Całe pole decyzji FR-006 sprowadza się więc do trzech miejsc: (a) wkładu do mapy, (b) tego, co koordynator widzi w kryzysie, (c) tego, czy numer może wyjść przez break-glass. Przyszłe S-07 (SMS) i S-08 (lista operacyjna) dokładają czwarte miejsce: kontakt po odpowiedzi TAK.

## 2. Zasady, z których wynika propozycja

1. **Ukryte = nieużyte.** Jeśli coś jest ukryte przed koordynatorem, nie może też wpływać na wynik ani kolejność. Inaczej koordynator widziałby osobę na liście bez widocznego powodu, a kolejność zdradzałaby ukrytą daną (ten sam wektor co trilateracja z audytu F-02).
2. **Nie kontrolujemy tego, co i tak nie wycieka.** E-mail, dokładna lokalizacja i stan przerwy nie są nikomu pokazywane, więc przełącznik dla nich byłby fikcją.
3. **Lokalizacja nie jest przełącznikiem.** Bez niej nie ma dopasowania; „ukryj lokalizację w kryzysie” to w praktyce przerwa (S-13), która już istnieje.
4. **Przełącznik działa natychmiast, także w trwającym kryzysie**, tak jak przerwa: filtr przy odczycie, nie przy aktywacji. Snapshot `crisis_matches` zostaje, ale odczyty go przycinają.
5. **Mało przełączników.** PRD odrzucił zarzut „per pole × per tryb to przesada”, ale cztery sensowne przełączniki realizują FR-006 w pełni; więcej nie da mieszkańcowi realnej kontroli, tylko więcej sposobów na zepsucie dopasowania.

## 3. Proponowana macierz

| #  | Przełącznik (UI, `/profil`)                                        | Dotyczy trybu | Domyślnie | Zakres             | Skutek po wyłączeniu                                                                                                                                                                         |
| -- | ------------------------------------------------------------------ | ------------- | --------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 | „Wliczaj mnie do publicznej mapy umiejętności”                     | codzienny     | wł.       | cały profil        | Osoba nie wlicza się do żadnego kwadratu mapy (od następnego dziennego odświeżenia). Kryzysy bez zmian.                                                                                        |
| V2 | „Używaj tej umiejętności w kryzysie” (przy każdej umiejętności)    | kryzysowy     | wł.       | per umiejętność    | Umiejętność nie bierze udziału w dopasowaniu, wyniku ani zespołach i nie pojawia się w `matched_skills`. Gdy żadna pasująca umiejętność nie zostaje, osoba znika z listy kryzysu. Na mapie nadal się liczy. |
| V3 | „Pokazuj koordynatorowi, kiedy jestem dostępny”                    | kryzysowy     | wł.       | cały profil        | `availability_slots` i „dostępny teraz” wracają jako puste (jak „nie podano”). Ranking bez zmian, bo dostępność i tak nie wchodzi do wyniku.                                                  |
| V4 | „Pozwól koordynatorowi odsłonić mój numer awaryjnie (break-glass)” | kryzysowy     | wł.       | cały profil        | `reveal_crisis_contacts` pomija numer tej osoby i nie zapisuje jej jako odsłoniętej. Na liście nadal widać „ma telefon”? → patrz pytanie D3.                                                  |

Elementy **bez przełącznika** (stałe reguły, opisane w UI jednym zdaniem):

| Dane                       | Reguła                                                                                                   | Dlaczego bez wyboru                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| E-mail                     | nigdy nikomu                                                                                             | nie wycieka                                                                                 |
| Lokalizacja                | nigdy jako punkt; w kryzysie tylko odległość co 0,5 km                                                   | wymagana do dopasowania; wyjściem jest przerwa                                              |
| Poziom umiejętności        | idzie razem z umiejętnością (V2)                                                                         | ukryty poziom przy liczącym się poziomie = wyciek przez kolejność; liczony jako 2/3 = fałsz |
| Numer po odpowiedzi TAK    | koordynator widzi go na liście operacyjnej (S-08)                                                        | odpowiedź TAK jest zgodą na kontakt w tym kryzysie                                          |
| Odbieranie SMS (S-07)      | sterowane podaniem numeru i przerwą                                                                      | już jest kontrolą; osobny przełącznik dublowałby przerwę                                    |
| Przerwa                    | nikt nie wie, że jest                                                                                    | bez zmian względem S-13                                                                     |

## 4. Decyzje do podjęcia (rekomendacja pogrubiona)

**D1. Wartości domyślne.** **Wszystkie wł.**, bo zgoda przy rejestracji obejmuje właśnie te cele, a cel produktu to dopasowanie. Alternatywa: V4 domyślnie wył. (privacy by default, art. 25 RODO) kosztem tego, że break-glass, czyli zapas na wypadek awarii sieci SMS, zwróci w pilocie mało numerów. Do potwierdzenia w przeglądzie prawnym `/prywatnosc`.

**D2. Czy w ogóle pozwolić wyłączyć break-glass (V4)?** **Tak.** Numer to najbardziej wrażliwe pole; mieszkaniec, który nie chce awaryjnego odsłonięcia, inaczej po prostu nie poda numeru i straci też SMS. Lepiej mieć numer do SMS bez break-glass niż żadnego.

**D3. Co widzi koordynator przy osobie z V4 = wył.?** **Nadal „ma telefon”** (dostanie SMS, a po TAK numer trafi na listę operacyjną), plus w oknie break-glass zdanie „N osób nie zgodziło się na awaryjne odsłonięcie numeru”, bez wskazania kogo. Alternatywa: nic nie mówić, ale wtedy koordynator nie wie, dlaczego odsłonięcie zwróciło mniej numerów niż „ma telefon”.

**D4. Granulacja V2: per umiejętność czy per kategoria?** **Per umiejętność.** Jest wiersz `profile_skills` na umiejętność, a lista koordynatora i tak pokazuje slugi. Per kategoria byłoby prostsze w UI, ale zbyt grube („medyczne” obejmuje i kurs pierwszej pomocy, i lekarza).

**D5. Czy V2 = wył. ma też zdejmować umiejętność z mapy?** **Nie.** Mapa ma własny przełącznik (V1) i jest zagregowana; mieszanie ich robi z jednej umiejętności dwie decyzje naraz. Alternatywa: V2 per umiejętność × 2 tryby (mapa/kryzys), czyli pełne „per pole × per tryb”.

**D6. Zmiana w trakcie aktywnego kryzysu.** **Działa od razu przy odczycie** (jak przerwa). Dla V2 lista przelicza `matched_skills` bez ukrytej umiejętności; pozycja i wynik zostają z chwili aktywacji, więc kolejność jest nieco nieaktualna, ale nie zdradza ukrytej umiejętności bardziej niż w momencie, gdy była jawna. Alternatywa: zmiana działa tylko na nowe kryzysy, co jest prostsze, ale łamie oczekiwanie „ukryłem, więc nie widać”.

**D7. Czy logować zmiany przełączników?** **Nie.** To ustawienia profilu, nie dostęp do danych; kontrolny zapis jest potrzebny dla zgody i odsłonięć, które już istnieją. Wyjątek do rozważenia: V4, bo zmienia zakres zgody na odsłonięcie.

**D8. Nowa wersja zgody.** **Tak**, zmiana `/prywatnosc` (opis przełączników) wymaga nowej `consent_versions`; zgodnie z obecną regułą to tylko ponowne zapytanie w aplikacji, nikogo nie wyrzuca z dopasowania.

## 5. Szkic wpływu na implementację (do `/10x-plan`)

- Kolumny: `profiles.show_on_map`, `profiles.show_availability_in_crisis`, `profiles.allow_contact_reveal` (boolean not null default true); `profile_skills.use_in_crisis` (boolean not null default true). Migracja expand-only.
- Rozdzielenie kwalifikowalności: `profile_counts_on_map` (dla `refresh_skills_density`, z V1) obok `profile_is_matchable` (kryzys, wymaga co najmniej jednej umiejętności z V2 = wł.). Dziś obie ścieżki używają tego samego `profile_is_matchable`.
- Do zmiany: `activate_crisis` (filtr V2), `get_crisis_matches` i `get_team_candidates` (V2 przy odczycie, V3), `reveal_crisis_contacts` (V4, zbiór logowany = zbiór zwrócony, jak przy przerwie), `refresh_skills_density` (V1), `save_my_profile` / `get_my_profile`, UI `/profil`, `/prywatnosc`, nowa wersja zgody.
- Kontrakt dla S-07: nadawca SMS stosuje V2 (alert tylko przy dopasowaniu na jawnej umiejętności) i przerwę; V4 nie wpływa na SMS.
- Testy pgTAP: każdy przełącznik × każda ścieżka odczytu, w tym zmiana w trakcie aktywnego kryzysu; aktualizacja `narrow_table_grants_test.sql`, jeśli zmienią się granty kolumnowe.

## 6. Co celowo poza zakresem

Imię/pseudonim (nie ma go w schemacie; PRD go nie wymaga), widoczność dla innych mieszkańców (brak FR, giełda sąsiedzka jest w Parked), ad-hoc wyszukiwanie FR-016 (Parked), mapa na żywo FR-013 (Parked). Jeśli któreś z nich wejdzie, macierz dostanie nową kolumnę „inni mieszkańcy” lub „poza kryzysem”.

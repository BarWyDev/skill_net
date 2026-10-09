# Plan testów manualnych — SkillNet (stan na 2026-10-07)

Przegląd funkcjonalny i UI wszystkich wdrożonych slice'ów: S-01, S-02, S-03, S-04, S-05, S-06, S-09, S-10, S-11, S-13, S-14, S-15.
Poza zakresem: S-07, S-08, S-12 (niewdrożone) i S-16 (wysyłka maili poza zespół).

## Środowiska

| Środowisko | Adres                                | Co testujemy                                                                                    |
| ---------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Lokalnie   | http://localhost:4321                | Wszystko. Konta testowe `@skillnet.test`, ok. 500 mieszkańców z seeda wokół Krakowa (31-001).   |
| Produkcja  | https://skillnet.barwy.workers.dev   | Tylko część publiczna (sekcja P). Scenariusze z logowaniem wykonuje użytkownik na własnym koncie. |

Na produkcji Claude nie zakłada kont, nie loguje się, nie nadaje roli koordynatora i nie aktywuje kryzysów.
Każdy taki krok to zmiana danych produkcyjnych i decyzja użytkownika.

## Przygotowanie (lokalnie)

| Krok | Działanie                                                                                                                | Uwagi                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 0.1  | Supabase działa, migracje i seed są wgrane (500 profili, 0 kryzysów).                                                    | Sprawdzone 2026-10-07                                        |
| 0.2  | Konto **M1** (mieszkaniec) zakłada się przez UI w scenariuszu U-01. Hasła M1/K1 leżą w `docs/qa/.konta.local` (gitignored). | `m1@skillnet.test`                                          |
| 0.3  | Konto **K1** (koordynator) zakłada się przez UI, rola nadawana SQL-em: `select public.grant_coordinator('k1@skillnet.test', 'local QA 2026-10-07');` | Studio: http://localhost:54323                               |
| 0.4  | Lokalnie `enable_confirmations = false`: rejestracja od razu tworzy aktywne konto (bez maila).                            | Dlatego U-04 testuje tylko ścieżkę błędnego linku.          |

Hasła kont testowych nie trafiają do repo ani do czatu.

Wariant odchudzony: każdy scenariusz testujemy na desktopie (800 px+). Telefon (375 px) testujemy w scenariuszach mobilnych (U-22, K-21) i przy pierwszym wejściu na każdą stronę w danej sekcji. Zwracamy uwagę na polskie teksty, czytelność, brak poziomego przewijania i błędy w konsoli.

Przebiegi wykonuje skill `/skillnet-qa <sekcja>` (`.claude/skills/skillnet-qa/SKILL.md`); znaleziska trafiają do `docs/qa/poprawki.md`.

## Stan przebiegu

Szczegóły wyników i znalezisk dla każdego ID są w [`poprawki.md`](poprawki.md) („Wyniki scenariuszy”).

| Sekcja | Stan | Data | Uwagi |
| ------ | ---- | ---- | ----- |
| A. Gość | ✅ sprawdzona | 2026-10-07 | G-01…G-10 |
| B. Rejestracja i logowanie | ✅ sprawdzona | 2026-10-07 | U-01…U-10; U-09 pominięty (opcjonalny, wymaga zmiany wersji zgody w bazie) |
| C. Profil mieszkańca | ✅ sprawdzona | 2026-10-07 | U-11…U-23; w U-16/U-17 profil nie ma przełącznika „tryb pinezki”, więc „pinezka bez kliknięcia” była sprawdzona przez HTTP |
| D. Wstrzymanie dostępności | ✅ sprawdzona | 2026-10-09 | U-24…U-28; U-28 pominięty (brak dostępnego konta z niekompletnym profilem; do wykonania np. na świeżym koncie przed uzupełnieniem profilu). Plan nie wspomina, że formularz po wstrzymaniu nie pokazuje bieżącego trybu (QA-022). Konto M1 usunięte w sekcji F (2026-10-09): przed ponownym przebiegiem D trzeba założyć M1 od nowa (U-01) i uzupełnić profil (C) |
| E. Koordynator | ✅ sprawdzona | 2026-10-09 | K-01…K-21, wszystkie wykonane. Rozbieżności: K-10 — aplikacja celowo nie pokazuje „licznika ukrytych”, wstrzymana osoba po prostu znika (przerwa w numeracji miejsc); K-01 wykonany na K1 przed nadaniem roli zamiast na M1; K-07 przez kod 38-713 zamiast pinezki; sekcja „ostatnio zakończonych” (K-03) widoczna dopiero po pierwszym zakończonym kryzysie. Kryzysy z testów zakończone po sekcji F; K-01 i K-09/K-10 wymagają M1, którego po sekcji F nie ma (U-01) |
| F. Wyrejestrowanie | ✅ sprawdzona | 2026-10-09 | U-29…U-31. Konto M1 usunięte: kolejny przebieg zaczyna się od U-01. Po sekcji zakończone wszystkie kryzysy z testów; K1 zostaje z rolą koordynatora |
| P. Produkcja | ✅ sprawdzona | 2026-10-09 | P-01…P-06; P-07, P-08 pominięte (wykonuje użytkownik na własnym koncie). Rozbieżność: P-06 ma dziś 26 kroków read-only, nie dwa. Poprawka QA-007 jeszcze nie jest na produkcji. `/prywatnosc` na produkcji jest oznaczona jako wersja robocza |

---

## A. Gość (niezalogowany) — ✅ sprawdzone 2026-10-07

| ID   | Scenariusz                     | Kroki                                                                    | Oczekiwany wynik                                                                                         |
| ---- | ------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| G-01 | Strona główna                  | Otwórz `/`                                                               | Hero SkillNet, 3 karty, przyciski Mapa / Załóż konto / Zaloguj się, w topbarze „Nie zalogowano”.         |
| G-02 | Ochrona tras                   | Otwórz `/profil`, `/dashboard`, `/zgoda`, `/koordynator`, `/koordynator/kryzys/<dowolne>` | Każda przekierowuje na `/auth/signin`.                                                                     |
| G-03 | Mapa — start                   | Otwórz `/mapa`                                                           | „Ładowanie mapy…”, potem mapa Polski, filtry umiejętności, pole kodu pocztowego.                         |
| G-04 | Mapa — kod pocztowy            | Wpisz `31-001`, Enter                                                    | Mapa przelatuje na Kraków, widać kwadraty 2×2 km w 3 odcieniach, legenda 5–9 / 10–24 / 25+.              |
| G-05 | Mapa — błędny/nieznany kod     | Wpisz `99-999`, potem `abc`                                              | Czytelny komunikat, mapa się nie psuje.                                                                  |
| G-06 | Mapa — filtry                  | Klikaj kolejne kategorie (Medyczne, Techniczne…), potem Wszystkie        | Zmieniają się kwadraty; aktywny filtr jest wyróżniony; rzadkie kategorie pokazują mniej kwadratów.       |
| G-07 | Mapa — prywatność              | Przybliż maksymalnie, sprawdź `/api/mapa` w DevTools                     | Brak pojedynczych osób, punktów i dokładnych liczb; tylko przedziały dla kwadratów z ≥ 5 osobami.        |
| G-08 | Informacja o danych            | Otwórz `/prywatnosc`                                                     | Pełna treść informacji RODO po polsku, działa bez logowania.                                             |
| G-09 | Brak dostępu                   | Otwórz `/brak-dostepu`                                                   | Strona 403 po polsku z drogą powrotu.                                                                     |
| G-10 | 404                            | Otwórz `/nieistnieje`                                                    | Strona 404 (sprawdzić, czy jest po polsku i ma powrót).                                                   |

## B. Rejestracja, zgoda i logowanie (S-05) — ✅ sprawdzone 2026-10-07 (U-09 pominięty)

| ID   | Scenariusz                          | Kroki                                                               | Oczekiwany wynik                                                                                           |
| ---- | ----------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| U-01 | Rejestracja poprawna                | `/auth/signup`: e-mail M1, hasło, zaznacz zgodę, wyślij             | Przekierowanie na `/auth/confirm-email` z instrukcją po polsku.                                             |
| U-02 | Rejestracja bez zgody               | Wypełnij formularz bez zaznaczenia zgody (też z wyłączonym `required` w DevTools) | Komunikat „Zaznacz zgodę na przetwarzanie danych, aby założyć konto.”, konto nie powstaje.                  |
| U-03 | Rejestracja — błędy                 | (a) istniejący e-mail M1, (b) hasło < 6 znaków, (c) zły format e-maila | (a) „Konto z tym adresem e-mail już istnieje…”, (b) „Hasło jest za słabe…”, (c) walidacja po polsku. Nigdy angielski tekst Supabase. |
| U-04 | Link potwierdzający nieważny        | Otwórz `/auth/confirm?token_hash=xxx&type=signup` i `/auth/confirm` bez parametrów | Przekierowanie na `/auth/link-wygasl` z opcją ponownego wysłania.                                          |
| U-05 | Link w zgodzie                      | Na formularzu kliknij „Informacja o przetwarzaniu danych”           | `/prywatnosc` otwiera się w nowej karcie, formularz zostaje.                                                |
| U-06 | Logowanie poprawne                  | `/auth/signin` z danymi M1                                          | Zalogowany; topbar pokazuje e-mail, linki Mapa / Mój profil / Panel / Wyloguj (bez „Koordynator”).          |
| U-07 | Logowanie błędne                    | Złe hasło; nieistniejący e-mail                                     | „Nieprawidłowy e-mail lub hasło.” (ten sam komunikat w obu przypadkach).                                    |
| U-08 | Wylogowanie                         | Kliknij „Wyloguj”, potem otwórz `/profil`                            | Powrót na stronę publiczną; `/profil` przekierowuje na logowanie.                                           |
| U-09 | Bramka zgody                        | Opcjonalnie: użytkownik bez aktualnej zgody (wymaga zmiany wersji zgody w bazie) | Każda strona przekierowuje na `/zgoda`; działa akceptacja, wylogowanie, usunięcie konta, `/prywatnosc`.    |
| U-10 | `/zgoda` dla kogoś z aktualną zgodą | Zalogowany M1 otwiera `/zgoda`                                      | Przekierowanie na `/`.                                                                                       |

## C. Profil mieszkańca (S-01, S-15, S-06) — ✅ sprawdzone 2026-10-07

| ID   | Scenariusz                          | Kroki                                                                       | Oczekiwany wynik                                                                                                  |
| ---- | ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| U-11 | Pusty profil                        | Nowe konto M1 otwiera `/profil`                                             | Baner „Profil niekompletny…”, ostrzeżenie „Bez numeru telefonu nie otrzymasz alertów”, brak sekcji wstrzymania.   |
| U-12 | Umiejętności z poziomem             | Zaznacz np. elektryk (poziom 3) i ratownik (poziom 1), zapisz              | „Zapisano.”; po odświeżeniu zaznaczenia i poziomy zostają. Umiejętność wymagająca poziomu bez poziomu = błąd.     |
| U-13 | Umiejętności bez poziomu            | Zaznacz sprzęt/narzędzie (np. generator), zapisz                           | Zapis bez pytania o poziom.                                                                                        |
| U-14 | Lokalizacja z kodu (S-15)           | Wybierz kod pocztowy `31-001`, zapisz, odśwież                              | Profil kompletny; pole kodu jest puste, widać „Ustawiono z kodu pocztowego”. Kod nie jest nigdzie zapisany.       |
| U-15 | Kod błędny / nieznany               | `12345` (normalizuje się do 12-345), `abc`, nieistniejący kod               | `abc` → „Podaj kod pocztowy w formacie 00-000.”; nieznany kod → komunikat po polsku.                               |
| U-16 | Lokalizacja pinezką                 | Przełącz na mapę, zaznacz punkt w Krakowie, zapisz                          | Zapis; po odświeżeniu pinezka jest w przybliżonym miejscu (ok. 500 m), nie w dokładnym kliknięciu.                |
| U-17 | Pinezka poza Polską / brak pinezki  | Tryb pinezki bez kliknięcia; punkt za granicą                                | „Zaznacz lokalizację na mapie.” / odrzucenie po polsku.                                                            |
| U-18 | Telefon poprawny                    | `600 123 456`, `+48600123456`, `0048600123456`                              | Zapis, wyświetlanie `+48 600 123 456`, ostrzeżenie o braku telefonu znika.                                         |
| U-19 | Telefon błędny                      | `123`, `100123456`, `+49…`                                                  | „Podaj polski numer komórkowy, np. 600 123 456.”; komunikat nie powtarza wpisanego numeru.                         |
| U-20 | Usunięcie telefonu                  | Wyczyść pole, zapisz                                                         | Telefon usunięty, ostrzeżenie wraca.                                                                               |
| U-21 | Dostępność                          | Zaznacz kilka pól siatki (dni × pory), zapisz, odśwież; potem wyczyść wszystko | Zaznaczenia zostają; puste = „nie zadeklarowano”.                                                                 |
| U-22 | Telefon — mobile                    | Cały formularz na 375 px                                                     | Siatka dostępności i mapa mieszczą się, przyciski mają ≥ 44 px, brak poziomego scrolla.                            |
| U-23 | Mapa po zmianie profilu             | Po U-14 otwórz `/mapa` na 31-001                                            | M1 jest wliczony w kwadrat (bez widocznego punktu).                                                                |

## D. Wstrzymanie dostępności (S-13) — ✅ sprawdzone 2026-10-09 (U-28 pominięty)

| ID   | Scenariusz                      | Kroki                                                          | Oczekiwany wynik                                                                                    |
| ---- | ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| U-24 | Wstrzymanie do daty             | Wybierz datę za tydzień, „Wstrzymaj dostępność”               | „Dostępność wstrzymana.”; żółty baner „…wstrzymana do DD.MM.RRRR włącznie”, przycisk „Wznów”.       |
| U-25 | Wstrzymanie bezterminowe        | Zmień na „Bezterminowo”                                        | Baner „…wstrzymana bezterminowo.”; sekcja nazywa się „Zmień wstrzymanie dostępności”.               |
| U-26 | Daty graniczne                  | Bez daty; data wczorajsza; data > 365 dni (obejście `min`/`max` w DevTools) | Komunikaty błędu po polsku, nic się nie zmienia.                                                     |
| U-27 | Wznowienie                      | „Wznów dostępność”                                              | „Dostępność wznowiona.”, baner „Profil kompletny”.                                                  |
| U-28 | Profil niekompletny             | Konto bez lokalizacji lub umiejętności                          | Zamiast formularza: „Wstrzymać dostępność możesz, gdy profil jest kompletny…”.                       |

## E. Koordynator (S-02, S-03, S-04, S-09, S-10) — ✅ sprawdzone 2026-10-09

| ID   | Scenariusz                              | Kroki                                                                                        | Oczekiwany wynik                                                                                                                         |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| K-01 | Mieszkaniec bez roli                    | M1 otwiera `/koordynator` i `/koordynator/kryzys/<id>`                                       | 403 „brak dostępu” w tym samym URL, brak linku „Koordynator” w topbarze.                                                                  |
| K-02 | Nadanie roli                            | SQL `grant_coordinator` dla K1; K1 odświeża stronę                                           | W topbarze pojawia się „Koordynator”, `/koordynator` się otwiera. Wpis w `coordinator_role_events`.                                      |
| K-03 | Panel koordynatora                      | Otwórz `/koordynator`                                                                         | Formularz aktywacji (6 typów kryzysu, promienie 1/2/5/10/20 km, domyślnie 5), sekcje aktywnych i ostatnio zakończonych kryzysów.          |
| K-04 | Aktywacja — kod pocztowy                | Awaria prądu, 31-001, 5 km, aktywuj                                                           | W ≤ 3 s strona kryzysu: liczba dopasowanych, lista „Osoba #N”, odległość, umiejętności (★ priorytetowe), odznaka dostępności, „bez telefonu”. Elektrycy i właściciele generatorów na górze. |
| K-05 | Aktywacja — pinezka                     | Powódź, punkt na mapie, 2 km                                                                  | Kryzys aktywny, inna kolejność (dominuje odległość).                                                                                       |
| K-06 | Aktywacja — błędy                       | Bez lokalizacji; kod `abc`; nieznany kod; punkt poza Polską                                  | „Wskaż epicentrum…”, „Podaj kod pocztowy w formacie 00-000.”, „Nie znamy tego kodu…”, „Epicentrum musi być w Polsce.”                    |
| K-07 | Pusta lista                             | Kryzys w miejscu bez mieszkańców (np. pinezka w Bieszczadach, 1 km)                           | „W tym promieniu nie ma dopasowanych mieszkańców.”                                                                                         |
| K-08 | Prywatność listy                        | Przejrzyj listę i HTML strony                                                                 | Brak e-maili, imion, numerów telefonów, współrzędnych, wyniku punktowego.                                                                 |
| K-09 | M1 na liście                            | Aktywuj kryzys pasujący do umiejętności M1 przy 31-001                                        | M1 jest na liście (rozpoznawalny po zestawie umiejętności i dostępności).                                                                 |
| K-10 | Wstrzymanie w trakcie kryzysu           | M1 wstrzymuje dostępność, K1 odświeża listę; potem M1 wznawia                                  | M1 znika z listy (licznik ukrytych rośnie), po wznowieniu wraca.                                                                          |
| K-11 | Zespoły — poprawnie (S-10)              | „Złóż zespoły”, szablon Zespół ewakuacyjny, liczba 3                                          | Składy z ról szablonu, liczba kompletnych zespołów, odświeżenie daje te same zespoły.                                                       |
| K-12 | Zespoły — za mało ludzi                 | Punkt medyczny, liczba 10, w małym kryzysie (1 km)                                            | Czytelna informacja o niekompletnych zespołach / brakujących rolach.                                                                      |
| K-13 | Zespoły — błędy                         | URL z `liczba=0`, `liczba=11`, `liczba=abc`, `szablon=xyz`                                    | „Podaj liczbę zespołów od 1 do 10.” / „Wybierz szablon zespołu z listy.”, status 422.                                                       |
| K-14 | Break-glass — ostrzeżenie (S-09)        | „Ujawnij kontakty (break-glass)”                                                              | Ostrzeżenie i formularz powodu, żadnych numerów przed wysłaniem.                                                                          |
| K-15 | Break-glass — zły powód                 | Powód pusty, 5 znaków, > 500 znaków                                                            | „Podaj powód (co najmniej 10 znaków).” / „Powód może mieć najwyżej 500 znaków.”, wpisany powód zostaje w polu.                              |
| K-16 | Break-glass — ujawnienie                | Powód ≥ 10 znaków, wyślij                                                                      | Lista z numerami (`+48 …`), informacja ile osób nie ma telefonu; wpis w dzienniku audytu; URL bez numerów; odświeżenie = nowe, osobno zalogowane ujawnienie. |
| K-17 | Kilka aktywnych kryzysów                | Aktywuj drugi kryzys                                                                           | Oba w sekcji aktywnych z czasem trwania; brak pomieszania list.                                                                            |
| K-18 | Zakończenie kryzysu (S-04)              | „Zakończ kryzys”, w oknie anuluj; potem potwierdź                                              | Anulowanie nic nie zmienia. Potwierdzenie → panel z „Kryzys zakończony. Lista dopasowanych osób została usunięta.”                          |
| K-19 | Kryzys zakończony                       | Otwórz URL zakończonego kryzysu, jego `/kontakty` i `/zespoly`                                 | Tylko podsumowanie i plakietka „Zakończony”; kontaktów nie można ujawnić, zespołów nie można złożyć.                                         |
| K-20 | Zły identyfikator                       | `/koordynator/kryzys/abc` i losowy UUID                                                        | 404 „Nie znaleziono kryzysu” z powrotem do panelu.                                                                                          |
| K-21 | Koordynator — mobile                    | K-04, K-11, K-16 na 375 px                                                                     | Lista, przyciski i okno potwierdzenia czytelne, brak poziomego scrolla.                                                                     |

## F. Wyrejestrowanie (S-14) — na końcu, nieodwracalne — ✅ sprawdzone 2026-10-09

| ID   | Scenariusz                     | Kroki                                                                              | Oczekiwany wynik                                                                                         |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| U-29 | Złe hasło                      | „Usuń konto na zawsze” z błędnym hasłem                                            | Komunikat o złym haśle na `/profil`, konto zostaje.                                                       |
| U-30 | Usunięcie konta                | Aktywny kryzys z M1 na liście; M1 usuwa konto poprawnym hasłem                      | Przekierowanie `/?konto-usuniete=1`, wylogowanie, logowanie M1 nie działa.                                |
| U-31 | Efekt u koordynatora           | K1 odświeża listę kryzysu i `/mapa`                                                | M1 znika z listy i z mapy natychmiast; dziennik audytu zachowuje tylko anonimowy identyfikator.          |

---

## P. Produkcja (https://skillnet.barwy.workers.dev) — ✅ sprawdzone 2026-10-09 (P-07, P-08 pominięte)

Claude wykonuje tylko P-01 do P-06 (odczyt, bez kont).

| ID   | Scenariusz                    | Oczekiwany wynik                                                                                                       |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| P-01 | G-01, G-03…G-10 na produkcji  | Jak lokalnie; brak banera brakującej konfiguracji.                                                                     |
| P-02 | G-02 ochrona tras             | Przekierowania na `/auth/signin`.                                                                                      |
| P-03 | Mapa na produkcji             | Tylko prawdziwe rejestracje (brak seeda): mapa może być prawie pusta, bo kwadraty < 5 osób są ukryte. To oczekiwane.    |
| P-04 | Formularze logowania i rejestracji | Renderują się po polsku, link do `/prywatnosc` działa (bez wysyłania formularzy).                                  |
| P-05 | Nagłówki bezpieczeństwa i cache | `Cache-Control: private, no-store` na trasach chronionych; publiczne strony bez danych osobowych w cache.              |
| P-06 | `npm run smoke` z `SMOKE_READONLY=1` | Dwa kroki read-only przechodzą.                                                                                 |
| P-07 | (użytkownik) U-01…U-31 na swoim koncie | Rejestrację z adresu spoza zespołu blokuje brak S-16; zespołowy adres powinien działać.                           |
| P-08 | (użytkownik) K-01…K-21        | Wymaga ręcznego nadania roli na produkcji. Aktywacja kryzysu na produkcji tworzy realne wpisy audytowe — decyzja użytkownika. |

## Wyniki

Znaleziska i wyniki przebiegów: [`poprawki.md`](poprawki.md). Notatki z wstępnego przejścia zostały tam przeniesione (QA-004, QA-006).

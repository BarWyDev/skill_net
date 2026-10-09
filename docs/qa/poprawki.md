# SkillNet — poprawki z testów manualnych

Plan: `docs/qa/plan-testow-manualnych.md`. Plik aktualizuje skill `skillnet-qa`; numery QA-NNN są stałe.

## Podsumowanie

| Waga | Otwarte | Regresje | Naprawione |
|---|---|---|---|
| blokujące | 0 | 0 | 0 |
| ważne | 0 | 0 | 8 |
| kosmetyczne | 1 | 0 | 19 |

## Otwarte

<!-- najpierw blokujące, potem ważne, potem kosmetyczne; w obrębie wagi po ID scenariusza -->

### QA-010 · G-08 · UX · kosmetyczne
- **Status:** otwarte (od 2026-10-07) — triage 2026-10-09: ryzyko zaakceptowane do pilotażu, treść uzupełnia właściciel
- **Widok:** desktop
- **Kroki:** Otwórz `/prywatnosc`.
- **Oczekiwane:** Ostateczna treść z danymi administratora przed pilotażem.
- **Faktycznie:** Baner „Wersja robocza. Treść czeka na przegląd prawny…”, brak danych administratora i kontaktu. Znany element przed pilotażem, nie błąd implementacji.
- **Dowód:** treść strony 2026-10-07
- **Propozycja:** Akceptacja ryzyka do pilotażu; uzupełnić przed startem (powiązane z Open Question 12 w roadmapie).

## Naprawione

<!-- znaleziska przeniesione z Otwartych, ze statusem naprawione (<data>) -->

### QA-001 · G-01, G-02, G-03, G-08, G-09, U-01, U-04, U-22, U-23, K-04, K-11, K-14, K-18, K-21 · a11y · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** 375 px
- **Kroki:** Otwórz na telefonie `/`, `/auth/signin`, `/mapa`, `/prywatnosc`, `/brak-dostepu`; zmierz elementy klikalne.
- **Oczekiwane:** Cele dotykowe co najmniej 44 × 44 px (PRD: interfejs działa na telefonie).
- **Faktycznie:**
  - linki topbaru „Mapa” / „Zaloguj się” / „Załóż konto” mają 20 px wysokości (każda strona);
  - `/auth/signin`: przycisk „Pokaż hasło” 16 × 16 px, „Zaloguj się” 36 px, link „Załóż konto” 17 px;
  - `/mapa`: przyciski filtrów kategorii 34 px, przyciski zoomu Leaflet 30 × 30 px;
  - `/brak-dostepu`: link „Wróć do profilu” 19 px;
  - `/auth/signup`: checkbox zgody 16 × 16 px, oba „Pokaż hasło” 16 × 16 px, „Załóż konto” 36 px, „Zaloguj się” 17 px;
  - `/auth/link-wygasl`: „Wyślij nowy link” 40 px, „Zaloguj się” 17 px; `/auth/confirm-email`: link 17 px;
  - panel koordynatora (K-21, 2026-10-09): `/koordynator` — zoom mapy 30 × 30 px; strona kryzysu — „← Panel koordynatora” 20 px, „Zakończ kryzys” 38 px, „Złóż zespoły” 36 px, „Ujawnij kontakty (break-glass)” 38 px; `/zespoly` — „← Lista dopasowanych” 20 px, pole liczby 38 px, „Złóż zespoły” 36 px; `/kontakty` — „Anuluj” i „Ujawnij kontakty” 38 px; okno „Zakończyć kryzys?” — „Anuluj” i „Zakończ kryzys” 38 px. Linki `tel:` na liście ujawnionych kontaktów mają 46 px (OK). Poziomego scrolla brak;
  - `/profil` (U-22, zalogowany): linki topbaru „Mapa” / „Mój profil” / „Panel” / „Wyloguj” 20 px, radia poziomu umiejętności („Podstawowy kurs”, „Praktyk”, „Profesjonalista”) 36 px wysokości, przyciski zoomu mapy 30 × 30 px; `/mapa` po zalogowaniu (U-23) tak samo jak u gościa (filtry 34 px, zoom 30 px).
- **Dowód:** `zrzuty/2026-10-07/G-01-375.jpg`, `G-02-375.jpg`, `G-03-375.jpg`, `U-22-375.jpg`, `zrzuty/2026-10-09/K-21-375.jpg`
- **Propozycja:** `min-h-11` / `py-3` dla linków w `src/components/Topbar.astro`, przycisku w `src/components/auth/SubmitButton.tsx` (`py-2` → `h-12` jak na `/profil`), filtrów w `src/components/map/DensityMap.tsx` (`py-1.5`), większy obszar przycisku „Pokaż hasło” w `src/components/auth/FormField.tsx`, `min-h-11` dla etykiet poziomu w `src/components/profile/SkillsPicker.tsx`.
- **Poprawka:** Linki topbaru, „← SkillNet”, linki w kartach auth, „Wróć…”, przyciski panelu koordynatora (lista, zespoły, kontakty, okno zakończenia) i pole liczby zespołów mają `min-h-11`; przycisk wysyłki formularzy auth `h-12`, pola `h-11`; „Pokaż hasło” to przycisk 44 × 44; checkbox zgody w etykiecie `min-h-11`; filtry mapy `min-h-11`; radia poziomu `min-h-11`; przyciski zoomu Leaflet 44 × 44 (`src/styles/global.css`).
- **Weryfikacja (2026-10-09):** na 375 px `/mapa`, `/profil`, `/koordynator`, `/auth/signup`: żaden klikalny element poniżej 44 px (pomiar `getBoundingClientRect`, etykieta liczona razem z polem), brak poziomego scrolla.

### QA-002 · G-08 · UX · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** Jako gość szukaj odnośnika do informacji o przetwarzaniu danych na `/`, `/mapa`, `/auth/signin`.
- **Oczekiwane:** Informacja RODO dostępna z każdej publicznej strony (stopka lub topbar).
- **Faktycznie:** `/prywatnosc` jest podlinkowana tylko z formularza rejestracji (`SignUpForm.tsx`) i z `/zgoda`. Gość ani zalogowany mieszkaniec nie ma do niej drogi z nawigacji.
- **Dowód:** `grep -rn "/prywatnosc" src` (2026-10-07)
- **Propozycja:** Stopka w `src/layouts/Layout.astro` z linkiem „Prywatność”.
- **Poprawka:** Stopka w `src/layouts/Layout.astro` z linkiem „Prywatność i przetwarzanie danych” na każdej stronie.
- **Weryfikacja (2026-10-09):** link w stopce na `/`, `/mapa`, `/auth/signin`.

### QA-003 · G-10 · tekst-i18n · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px, lokalnie i na produkcji
- **Kroki:** Otwórz `/nieistnieje` (lokalnie i na `https://skillnet.barwy.workers.dev/nieistnieje`).
- **Oczekiwane:** Strona 404 po polsku, w wyglądzie SkillNet, z drogą powrotu.
- **Faktycznie:** Domyślna strona Astro „404: Not found / Path: /nieistnieje”, po angielsku, z logo Astro, bez nawigacji. Na produkcji tak samo (tytuł „404: Not Found”).
- **Dowód:** `zrzuty/2026-10-07/G-10-desktop.jpg`
- **Propozycja:** Dodać `src/pages/404.astro` z `Layout` + `Topbar` i linkami do `/` i `/mapa`.
- **Poprawka:** `src/pages/404.astro`: po polsku, z topbarem i linkami do `/` i `/mapa`, status 404.
- **Weryfikacja (2026-10-09):** `/nieistnieje` → 404 „Nie znaleziono strony”; nowy krok smoke.

### QA-014 · U-06 · tekst-i18n · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Zaloguj się jako M1, kliknij „Panel” w topbarze (`/dashboard`).
- **Oczekiwane:** Polska strona w wyglądzie aplikacji albo brak tej pozycji w menu.
- **Faktycznie:** Strona ze startera: „Dashboard / Welcome, m1@skillnet.test / This page is only for authenticated users / Sign out”, po angielsku, bez topbaru. Jedyna treść to link do profilu.
- **Dowód:** `zrzuty/2026-10-07/U-06-dashboard-desktop.jpg`
- **Propozycja:** Usunąć link „Panel” z `src/components/Topbar.astro` i przekierować `/dashboard` na `/profil` (`src/pages/dashboard.astro`); zaktualizować `PROTECTED_ROUTES` i `scripts/smoke.mjs`, jeśli smoke sprawdza `/dashboard`.
- **Poprawka:** „Panel” usunięty z topbaru; `/dashboard` to teraz przekierowanie na `/profil` (`src/pages/dashboard.ts`), dalej w `PROTECTED_ROUTES`. Smoke: zalogowany → 302 `/profil`.
- **Weryfikacja (2026-10-09):** `npm run smoke` lokalnie — wszystkie kroki PASS.

### QA-017 · U-15, U-17 · UX · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/profil` jako M1. Zaznacz dodatkowo „Pompa do wody”, w polu kodu wpisz `99-999` (pojawia się „Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.”), kliknij „Zapisz profil”. To samo z pinezką postawioną poza Polską.
- **Oczekiwane:** Formularz nie wysyła się, dopóki lokalizacja jest znana jako błędna, a niezapisane zmiany zostają w formularzu.
- **Faktycznie:** Klient przepuszcza nieznany kod i pinezkę za granicą; serwer odrzuca zapis (302 na `/profil?error=Nie znamy tego kodu…` / `?error=Lokalizacja musi być w Polsce.`), strona przeładowuje się z danymi z bazy. Zaznaczona „Pompa do wody” znika, tak samo każda inna niezapisana zmiana (umiejętności, telefon, dostępność). Komunikat zostaje w URL i wraca po odświeżeniu. Mapa nie ma granic (`maxBounds`), więc da się ją przesunąć daleko poza Polskę.
- **Dowód:** `zrzuty/2026-10-07/U-15-desktop.jpg`; odczyt stanu checkboxa po przeładowaniu (2026-10-07).
- **Propozycja:** W `handleSubmit` (`src/components/profile/ProfileForm.tsx`) blokować wysyłkę, gdy `LocationPicker` ma status `unknown`/`failed` i nie postawiono pinezki, oraz gdy pinezka jest poza prostokątem Polski (ten sam warunek co `outside_poland`); `maxBounds` na mapie w `LocationPicker.tsx`. Długoterminowo wysyłka przez `fetch`, żeby błąd serwera nie kasował formularza (por. QA-011).
- **Poprawka:** `locationProblem()` w `LocationPicker.tsx`: `ProfileForm` blokuje wysyłkę przy nieznanym/nieskończonym kodzie i przy pinezce poza Polską (obrys z QA-024), komunikat przy przycisku; przy mapie komunikat „Lokalizacja musi być w Polsce. Przesuń znacznik.”. Mapy mają `maxBounds` wokół Polski i `minZoom` 5. Komunikat `?error=` znika z URL po wczytaniu (`history.replaceState`), więc nie wraca po odświeżeniu.
- **Weryfikacja (2026-10-09):** K1, `/profil`: Elektryk + poziom, kod `99-999`, „Zapisz profil” → „Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.”, bez przeładowania, zaznaczenia zostają.

### QA-024 · K-06, U-17 · błąd · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/koordynator`, rodzaj „Awaria prądu”, bez kodu kliknij mapę w Czechach na północ od Pragi (ok. 50,53 N / 14,79 E), „Aktywuj”.
- **Oczekiwane:** „Epicentrum musi być w Polsce.”, kryzys nie powstaje.
- **Faktycznie:** Kryzys zostaje aktywowany (`status = active`, epicentrum 50,53 / 14,79, 0 dopasowanych). „W Polsce” to prostokąt `lat 49,0–54,9`, `lng 14,1–24,2` (`supabase/migrations/20261001120000_crisis_matching.sql:129`, ten sam w triggerze profilu), więc przechodzą też punkty w Czechach, na Słowacji, Litwie, Białorusi, Ukrainie i w obwodzie królewieckim; dotyczy także pinezki w profilu (U-17). Punkt poza prostokątem (Berlin, 13,40 E) jest odrzucany poprawnie, ale dopiero po wysłaniu: przycisk „Aktywuj” jest aktywny, a po błędzie formularz traci rodzaj kryzysu i pinezkę.
- **Dowód:** `zrzuty/2026-10-09/K-06-desktop.jpg` (strona aktywnego kryzysu z epicentrum w Czechach)
- **Propozycja:** Sprawdzać punkt względem obrysu Polski, np. tabeli z granicą (PostGIS `st_contains`) albo przynajmniej uproszczonego wielokąta, w `create_crisis` i w triggerze lokalizacji profilu; w `LocationPicker.tsx` ta sama kontrola po stronie klienta z komunikatem przy mapie.
- **Poprawka:** Migracja `20261009120000_poland_outline_and_crisis_place.sql`: `is_in_poland()` z uproszczonym obrysem (~107 wierzchołków, kilka km na zewnątrz granicy) zamiast prostokąta, w triggerze profilu i w `activate_crisis`. Ten sam obrys w `src/lib/poland.ts` do sprawdzenia w przeglądarce: formularz kryzysu nie pozwala aktywować z pinezką za granicą. Testy: `src/lib/poland.test.ts`, `supabase/tests/poland_outline_test.sql`. **Migracji nie ma jeszcze na produkcji** (`npx supabase db push` przed merge).
- **Weryfikacja (2026-10-09):** wszystkie centroidy kodów leżą w obrysie poza `57-522`, którego centroid w seedzie jest w Czechach (błąd danych, kod pocztowy nie przechodzi przez obrys); Praga-północ, Hradec Králové, Ostrawa, Grodno, Brześć, Lwów, Łoździeje, Kaliningrad, Mamonowo odrzucane. W panelu K1 pinezka w Czechach → komunikat przy mapie, „Aktywuj” nieaktywny. `npm run test:db` PASS.

### QA-026 · K-17 · UX · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Aktywuj dwa kryzysy tego samego rodzaju i promienia w różnych miejscach (np. „Awaria prądu”, 5 km), otwórz `/koordynator`.
- **Oczekiwane:** Koordynator odróżnia kryzysy na liście aktywnych.
- **Faktycznie:** Dwie pozycje „Awaria prądu · 5 km” różnią się tylko godziną aktywacji i liczbą osób. Ani lista, ani nagłówek strony kryzysu nie pokazują miejsca (kod pocztowy, miejscowość albo mapka). Przy kilku równoczesnych awariach łatwo otworzyć nie ten kryzys i np. ujawnić kontakty w złym.
- **Dowód:** odczyt sekcji „Aktywne kryzysy” (2026-10-09): „Awaria prądu · 5 km / 9.10.2026, 19:18 · 62 osoby” i „Awaria prądu · 5 km / 9.10.2026, 19:16 · 0 osób”
- **Propozycja:** Zapisywać przy kryzysie etykietę miejsca (kod pocztowy epicentrum albo najbliższy kod z `postcodes`) i pokazywać ją w `src/pages/koordynator/index.astro` (linia z `typeName · radiusKm km`) i w nagłówku `kryzys/[id].astro`.
- **Poprawka:** Kolumna `crises.epicentre_postcode` (wpisany kod albo najbliższy kod do pinezki, uzupełniona też dla istniejących kryzysów); lista w panelu, nagłówki strony kryzysu, zespołów, kontaktów i okno zakończenia pokazują „okolice NN-NNN”.
- **Weryfikacja (2026-10-09):** panel K1: „Awaria prądu · 5 km · okolice 31-001”, stare kryzysy „okolice 59-921” / „31-139” / „38-713”.

### QA-028 · P-05 · bezpieczeństwo · ważne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** produkcja (`curl -sI`), lokalnie tak samo
- **Kroki:** `curl -sI https://skillnet.barwy.workers.dev/` (oraz `/auth/signin`, `/mapa`, `/prywatnosc`, `/brak-dostepu`).
- **Oczekiwane:** Podstawowe nagłówki ochronne, przynajmniej zakaz osadzania w ramce na stronach z formularzami (`Content-Security-Policy: frame-ancestors 'none'` lub `X-Frame-Options: DENY`) i `X-Content-Type-Options: nosniff`.
- **Faktycznie:** Żadna odpowiedź nie ma `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ani `Permissions-Policy`. Każdą stronę, także logowanie, „Usuń konto” i formularz break-glass, można osadzić w obcej ramce (clickjacking). HSTS nie jest potrzebny, bo domena `.dev` jest na liście HSTS preload. Waga „ważne”, a nie „blokujące”: to uwaga o utwardzeniu, a nie wykazana podatność. Formularze o skutkach nieodwracalnych wymagają wpisania hasła albo powodu, co utrudnia atak przez samo kliknięcie.
- **Dowód:** nagłówki z `curl -s -D -` (2026-10-09): `/` → tylko `HTTP/2 200`; `/mapa`, `/prywatnosc` → `cache-control: private`; `/api/mapa` → `cache-control: private, max-age=300`; żadnego z nagłówków bezpieczeństwa.
- **Propozycja:** Ustawiać je w `src/middleware.ts` dla każdej odpowiedzi (tam, gdzie dziś jest `Cache-Control`): `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` (pełne CSP osobno, bo Leaflet ładuje kafelki OSM), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Poprawka:** `src/middleware.ts` dodaje do każdej odpowiedzi `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (także do przekierowań). Pełne CSP osobno. Smoke sprawdza nagłówki na `/` i `/auth/signin`.
- **Weryfikacja (2026-10-09):** `curl -sI` lokalnie: `/auth/signin` i 302 z `/profil` mają wszystkie cztery nagłówki. Statyczne pliki z `public/` idą z Workers Assets, bez middleware.

### QA-004 · G-01 · tekst-i18n · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** Otwórz `/`, pierwsza karta „Dodaj swoje umiejętności”.
- **Oczekiwane:** Tekst neutralny płciowo lub w obu formach.
- **Faktycznie:** „…zaznacz, w czym możesz pomóc i kiedy jesteś dostępny.” — tylko forma męska.
- **Dowód:** `zrzuty/2026-10-07/G-01-desktop.jpg`
- **Propozycja:** „…i kiedy możesz to robić.” (`src/components/Welcome.astro:62`).
- **Poprawka:** „…zaznacz, w czym możesz pomóc i kiedy możesz to robić.”
- **Weryfikacja (2026-10-09):** tekst w `Welcome.astro`.

### QA-005 · G-02, G-09 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** (a) Jako gość otwórz `/profil`. (b) Jako gość otwórz `/brak-dostepu`.
- **Oczekiwane:** (a) Strona logowania mówi, dlaczego tu jesteś, i ma drogę na stronę główną; po zalogowaniu wracasz tam, dokąd szedłeś. (b) Link powrotu pasuje do stanu zalogowania.
- **Faktycznie:** (a) `/auth/signin` bez topbaru i bez komunikatu; po zalogowaniu `signin.ts` przekierowuje zawsze na `/` lub `/profil`, nie na żądaną stronę. (b) Gość widzi „Wróć do profilu”, który prowadzi znowu do logowania; tytuł strony „Brak dostępu” bez „— SkillNet” (inne strony mają sufiks).
- **Dowód:** `zrzuty/2026-10-07/G-02-375.jpg`, `G-09-desktop.jpg`
- **Propozycja:** Topbar lub link „← SkillNet” na stronach `auth/*`; opcjonalnie parametr powrotu (tylko ścieżki względne). W `src/pages/brak-dostepu.astro` link zależny od `Astro.locals.user` i tytuł z sufiksem.
- **Poprawka:** (a) karty `auth/*` mają link „← SkillNet”; middleware dokleja `?powrot=<ścieżka>` przy przekierowaniu z chronionej strony (GET/HEAD), strona logowania mówi „Ta strona jest dostępna po zalogowaniu…”, a `signin.ts` po zalogowaniu wraca tam (tylko ścieżki tej strony, `src/lib/return-path.ts` z testami). (b) `/brak-dostepu`: gość dostaje „Wróć na stronę główną”, tytuł z sufiksem „— SkillNet”.
- **Weryfikacja (2026-10-09):** `/koordynator` jako gość → `/auth/signin?powrot=%2Fkoordynator`; smoke: powrót na `/mapa`, `//evil.example/` ignorowany.

### QA-006 · G-03 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** Jako gość otwórz `/mapa`.
- **Oczekiwane:** Pierwszy widok pokazuje coś czytelnego albo zachęca do wpisania kodu.
- **Faktycznie:** Mapa startuje na całej Polsce; kwadraty 2 km są w tej skali niewidoczne, więc mapa wygląda na pustą, dopóki gość nie wpisze kodu.
- **Dowód:** `zrzuty/2026-10-07/G-03-375.jpg`
- **Propozycja:** Podpowiedź przy pustym widoku („Wpisz kod pocztowy, żeby zobaczyć swoją okolicę”) albo start na obszarze z danymi (`POLAND_VIEW` w `src/components/map/DensityMap.tsx`).
- **Poprawka:** Przy widoku całej Polski (bez punktu startowego i przed wyszukaniem kodu) podpowiedź „Wpisz kod pocztowy, żeby zobaczyć swoją okolicę…”.
- **Weryfikacja (2026-10-09):** widoczna na `/mapa` (375 px).

### QA-008 · G-06 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** `/mapa`, kod `31-001`, filtr „Techniczne”.
- **Oczekiwane:** Jasne, że brak kwadratów to ochrona prywatności, a nie brak ludzi.
- **Faktycznie:** Mapa pusta, „Brak obszarów z co najmniej 5 osobami dla tego filtra.” Działa zgodnie z założeniem: 120 osób z umiejętnościami technicznymi w seedzie, rozproszonych po 84 kwadratach, max 4 w kwadracie. Komunikat łatwo odczytać jako „nikt tu nie ma tych umiejętności”. W realnym pilotażu rzadkie kategorie będą tak wyglądać zawsze.
- **Dowód:** zapytanie agregujące na lokalnej bazie (2026-10-07); widok pokazany użytkownikowi w panelu przeglądarki.
- **Propozycja:** „W żadnym kwadracie nie ma jeszcze 5 osób z tą umiejętnością. Mniejsze skupiska ukrywamy dla prywatności.” (`statusMessage` w `DensityMap.tsx`). Decyzja o progu: Unknown S-11 w roadmapie.
- **Poprawka:** Pusta mapa: „W żadnym kwadracie nie ma jeszcze 5 osób z umiejętnościami z tej grupy. Mniejsze skupiska ukrywamy dla prywatności.” (bez filtra: wariant bez „z tej grupy”). Próg nadal do decyzji (S-11).
- **Weryfikacja (2026-10-09):** kod `DensityMap.tsx`.

### QA-009 · G-08, G-09 · błąd · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Otwórz `/prywatnosc` lub `/brak-dostepu`, konsola.
- **Oczekiwane:** Brak błędów w konsoli.
- **Faktycznie:** `Failed to load resource: 404` — przeglądarka pyta o `/favicon.ico`, a w `public/` jest tylko `favicon.png` (`/favicon.ico`, `/apple-touch-icon.png` → 404). (403 na `/brak-dostepu` to zamierzony status strony.)
- **Dowód:** `curl` statusów 2026-10-07
- **Propozycja:** Dodać `public/favicon.ico` (i opcjonalnie `apple-touch-icon.png`).
- **Poprawka:** `public/favicon.ico` (PNG w kontenerze ICO) i `public/apple-touch-icon.png` 180 × 180, link w `Layout.astro`.
- **Weryfikacja (2026-10-09):** `/favicon.ico` → 200.

### QA-011 · U-07, U-03 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/auth/signin`, poprawny format e-maila, złe hasło, „Zaloguj się”.
- **Oczekiwane:** Po błędzie e-mail zostaje w polu, poprawia się tylko hasło.
- **Faktycznie:** Komunikat „Nieprawidłowy e-mail lub hasło.” jest poprawny (ten sam dla istniejącego i nieistniejącego konta), ale pole e-mail jest puste: formularz robi pełny POST z przekierowaniem. Komunikat zostaje w URL (`?error=…`), więc wraca też po odświeżeniu strony.
- **Dowód:** `zrzuty/2026-10-07/U-07-desktop.jpg`
- **Propozycja:** Nie przekazywać e-maila w URL (dane osobowe). Zamiast tego zapamiętać go po stronie klienta przed wysłaniem (`sessionStorage` w `src/components/auth/SignInForm.tsx`) albo wysyłać formularz przez `fetch`. To samo dotyczy rejestracji (`SignUpForm.tsx`): po „Konto z tym adresem e-mail już istnieje. Zaloguj się.” formularz jest pusty (e-mail i zgoda wyczyszczone), a „Zaloguj się” w komunikacie nie jest linkiem.
- **Poprawka:** Logowanie: e-mail wraca do pola po każdym błędzie (sessionStorage, nie URL). Rejestracja: to samo z osobnym kluczem; zgoda celowo zostaje odznaczona; przy „Konto … już istnieje” link „Przejdź do logowania”.
- **Weryfikacja (2026-10-09):** kod; nie sprawdzone w przeglądarce, żeby nie wylogować K1 — do potwierdzenia w U-03/U-07.

### QA-012 · U-01, U-06 · a11y · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** Sprawdź atrybuty pól na `/auth/signup` i `/auth/signin`.
- **Oczekiwane:** `autocomplete="email"`, `"new-password"` (rejestracja) i `"current-password"` (logowanie), żeby menedżery haseł i autouzupełnianie działały.
- **Faktycznie:** Pola e-maila i hasła w formularzach React nie mają `autocomplete` (jest tylko na `/auth/link-wygasl`).
- **Dowód:** `grep -n autoComplete src/components/auth/*.tsx` (brak wyników)
- **Propozycja:** Prop `autoComplete` w `FormField.tsx`, ustawiany w `SignInForm.tsx` i `SignUpForm.tsx`.
- **Poprawka:** Prop `autoComplete` w `FormField`: `email`, `current-password` (logowanie), `new-password` (rejestracja).
- **Weryfikacja (2026-10-09):** `/auth/signup`: `email:email`, `password:new-password`, `confirmPassword:new-password`.

### QA-013 · U-03 · tekst-i18n · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** — (żądanie HTTP)
- **Kroki:** `POST /api/auth/signup` z pustym e-mailem i hasłem, zgoda zaznaczona (sytuacja bez JS albo obejście formularza).
- **Oczekiwane:** Konkretny komunikat, np. „Podaj adres e-mail i hasło.”
- **Faktycznie:** Ogólne „Coś poszło nie tak. Spróbuj ponownie za chwilę.” (Formularz w przeglądarce blokuje taki przypadek wcześniej poprawnymi komunikatami.)
- **Dowód:** odpowiedź 302 z `?error=` (2026-10-07)
- **Propozycja:** Sprawdzić puste pola w `src/pages/api/auth/signup.ts` przed wywołaniem `signUp`.
- **Poprawka:** `signup.ts` sprawdza puste pola przed `signUp`: „Podaj adres e-mail i hasło.”.
- **Weryfikacja (2026-10-09):** kod; smoke PASS.

### QA-015 · U-10 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Zaloguj się jako M1, otwórz `/`.
- **Oczekiwane:** Zalogowany widzi np. „Mój profil” zamiast przycisków rejestracji.
- **Faktycznie:** Hero nadal pokazuje „Załóż konto” i „Zaloguj się” (topbar już jest poprawny).
- **Dowód:** `zrzuty/2026-10-07/U-10-desktop.jpg`
- **Propozycja:** Przyciski zależne od `Astro.locals.user` w `src/components/Welcome.astro`.
- **Poprawka:** Hero na `/`: zalogowany widzi „Mój profil” zamiast „Załóż konto” / „Zaloguj się”.
- **Weryfikacja (2026-10-09):** kod `Welcome.astro`.

### QA-016 · U-01 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop, tylko lokalnie (`enable_confirmations = false`)
- **Kroki:** Załóż nowe konto (lokalnie), na `/auth/confirm-email` przejdź na `/`.
- **Oczekiwane:** Komunikat zgodny ze stanem sesji.
- **Faktycznie:** Strona mówi „Konto założone. Twoje konto jest gotowe. Możesz się teraz zalogować.” z linkiem do logowania, ale użytkownik jest już zalogowany (`signUp` zwraca sesję, topbar na `/` pokazuje e-mail). Na produkcji (potwierdzanie maila włączone) działa inna gałąź tekstu, której lokalnie nie da się sprawdzić.
- **Dowód:** `zrzuty/2026-10-07/U-01-desktop.jpg`
- **Propozycja:** W gałęzi `isAutoConfirmed` (`src/pages/auth/confirm-email.astro`) link „Uzupełnij profil” → `/profil` zamiast logowania, albo w `api/auth/signup.ts` przekierować od razu na `/profil`, gdy `signUp` zwrócił sesję.
- **Poprawka:** `/auth/confirm-email` z aktywną sesją: „Konto założone… Możesz od razu uzupełnić profil…” z linkiem „Uzupełnij profil” → `/profil`.
- **Weryfikacja (2026-10-09):** kod; do potwierdzenia w U-01.

### QA-020 · U-12 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/profil`, zaznacz „Elektryk” bez wybierania poziomu, przewiń na dół, „Zapisz profil”.
- **Oczekiwane:** Widać, której umiejętności brakuje poziomu.
- **Faktycznie:** Komunikat „Wybierz poziom dla każdej zaznaczonej umiejętności.” pojawia się tylko nad przyciskiem zapisu, kilka ekranów pod listą umiejętności. Fokus zostaje na przycisku, grupa poziomu nie dostaje `aria-invalid` ani wyróżnienia. Przy kilku zaznaczonych umiejętnościach trzeba szukać, której brakuje.
- **Dowód:** `zrzuty/2026-10-07/U-12-desktop.jpg`
- **Propozycja:** W `handleSubmit` (`src/components/profile/ProfileForm.tsx`) przewinąć i ustawić fokus na pierwszej grupie „Poziom: …” bez wyboru, oznaczyć ją `aria-invalid` i czerwoną ramką; w komunikacie podać nazwę umiejętności.
- **Poprawka:** Komunikat wymienia umiejętności bez poziomu („Wybierz poziom dla: Elektryk.”), strona przewija do pierwszej takiej grupy i ustawia na niej fokus, radia mają `aria-invalid` i `aria-describedby`.
- **Weryfikacja (2026-10-09):** K1: Elektryk bez poziomu → komunikat, fokus na `level-elektryk`, `aria-invalid="true"`, grupa w widoku.

### QA-021 · U-16, U-23 · tekst-i18n · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** `/profil` lub `/mapa`, najedź na przyciski „+” / „−” mapy albo odczytaj je czytnikiem ekranu.
- **Oczekiwane:** Polskie podpowiedzi i etykiety.
- **Faktycznie:** Domyślne etykiety Leaflet po angielsku: `title` i `aria-label` „Zoom in” / „Zoom out” (podpowiedź widoczna po najechaniu).
- **Dowód:** odczyt atrybutów `.leaflet-control-zoom-out` (2026-10-07)
- **Propozycja:** `zoomControl={false}` i `<ZoomControl zoomInTitle="Przybliż" zoomOutTitle="Oddal" />` z `react-leaflet` w `LocationPicker.tsx` i `DensityMap.tsx`.
- **Poprawka:** `ZoomControl` z „Przybliż” / „Oddal” w obu mapach.
- **Weryfikacja (2026-10-09):** przyciski „Przybliż” / „Oddal” w panelu koordynatora.

### QA-018 · U-18 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/profil`, wpisz `600 123 456` (lub `0048600123456`), zapisz.
- **Oczekiwane:** Numer wyświetlany jako `+48 600 123 456`.
- **Faktycznie:** Zapis działa (w bazie format E.164), ostrzeżenie o braku telefonu znika, ale pole po zapisie pokazuje `+48600123456` bez odstępów. `formatPhone()` z `src/lib/phone.ts` jest używane tylko w widoku kontaktów koordynatora.
- **Dowód:** wartość pola po zapisie (2026-10-07)
- **Propozycja:** `useState(profile.phone ? formatPhone(profile.phone) : "")` w `src/components/profile/ProfileForm.tsx` (normalizacja przy zapisie i tak usuwa spacje).
- **Poprawka:** Pole telefonu startuje z `formatPhone()` (`+48 600 123 456`).
- **Weryfikacja (2026-10-09):** kod `ProfileForm.tsx`.

### QA-019 · U-19 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Zapisz profil (strona `/profil?zapisano=1` pokazuje „Zapisano.”), potem wpisz telefon `123` i kliknij „Zapisz profil”.
- **Oczekiwane:** Widać tylko bieżący wynik: błąd.
- **Faktycznie:** Na górze strony nadal stoi zielone „Zapisano.”, a błąd „Podaj polski numer komórkowy, np. 600 123 456.” jest na dole przy przycisku. Na pierwszym ekranie użytkownik widzi tylko „Zapisano.”. Treść błędu poprawna i nie powtarza numeru (także po stronie serwera).
- **Dowód:** `zrzuty/2026-10-07/U-19-desktop.jpg`
- **Propozycja:** Ukryć baner „Zapisano.” przy pierwszej zmianie formularza albo przy błędzie klienta (`src/pages/profil.astro` + `ProfileForm.tsx`), np. `history.replaceState` usuwający `?zapisano=1` i stan w React.
- **Poprawka:** Banery „Zapisano.” i `?error=` (`data-page-notice`) znikają przy pierwszej zmianie formularza i przy błędzie klienta; parametr znika z URL po wczytaniu.
- **Weryfikacja (2026-10-09):** kod; do potwierdzenia w U-19.

### QA-022 · U-25 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** `/profil`, wstrzymaj dostępność „Bezterminowo, do wznowienia”. Po przeładowaniu sekcja nazywa się „Zmień wstrzymanie dostępności”; kliknij od razu „Zmień wstrzymanie”.
- **Oczekiwane:** Formularz pokazuje bieżące wstrzymanie (zaznaczone „Bezterminowo” albo data końca), a ponowne zapisanie bez zmian nic nie psuje.
- **Faktycznie:** Zawsze zaznaczone jest „Do dnia (włącznie)” z pustą datą, także przy wstrzymaniu do konkretnego dnia. Kliknięcie „Zmień wstrzymanie” bez zmian kończy się błędem „Wybierz datę od dziś do roku naprzód.” (wstrzymanie w bazie zostaje bez zmian). Baner nad formularzem podaje poprawny stan, ale sam formularz mu przeczy.
- **Dowód:** odczyt formularza w stanie „wstrzymana bezterminowo”: `mode:checked = "date"`, `#pause-until.value = ""` (2026-10-09). Zrzutu brak: ponowne wstrzymanie konta tylko do zrzutu zablokował filtr uprawnień.
- **Propozycja:** Przekazać `pausedUntil` do `src/components/profile/PauseAvailability.astro` i ustawić `checked` na `indefinite`, gdy `paused && !pausedUntil`, albo `value={pausedUntil}` w polu daty.
- **Poprawka:** `PauseAvailability` dostaje `pausedUntil`: przy wstrzymaniu bezterminowym zaznaczone „Bezterminowo”, przy dacie pole ma tę datę.
- **Weryfikacja (2026-10-09):** kod; do potwierdzenia w U-25.

### QA-023 · K-03 · tekst-i18n · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** `/koordynator`, formularz aktywacji, pod mapą epicentrum.
- **Oczekiwane:** Tekst o epicentrum kryzysu.
- **Faktycznie:** „Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu.” To tekst dla mieszkańca z profilu (`LocationPicker` jest wspólny). Dla koordynatora jest mylący: epicentrum nie jest adresem koordynatora i nie jest zaokrąglane (pinezka w K-05 zapisana z pełną dokładnością).
- **Dowód:** `zrzuty/2026-10-09/K-03-desktop.jpg`
- **Propozycja:** Prop `hint` w `src/components/profile/LocationPicker.tsx` (linia 194); w `CrisisActivationForm.tsx` np. „Epicentrum to środek obszaru, w którym szukamy mieszkańców.”
- **Poprawka:** Prop `hint` w `LocationPicker`; w formularzu kryzysu: „Epicentrum to środek obszaru, w którym szukamy mieszkańców. Zapisujemy je dokładnie, bez zaokrąglania.”
- **Weryfikacja (2026-10-09):** panel K1.

### QA-025 · K-04, K-05, K-11, K-14, K-18 · tekst-i18n · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop + 375 px
- **Kroki:** Aktywuj kryzys z 62 dopasowanymi (K-04) albo 34 (K-05), spójrz na nagłówek strony kryzysu, `/zespoly`, `/kontakty` i okno „Zakończyć kryzys?”.
- **Oczekiwane:** Poprawna odmiana, np. „62 osoby dopasowane”, „1 osoba dopasowana”, „5 osób dopasowanych”.
- **Faktycznie:** „62 osoby dopasowanych”, „34 osoby dopasowanych”; przy 1 osobie wyjdzie „1 osoba dopasowanych”. `formatPeople()` odmienia rzeczownik, a przymiotnik „dopasowanych” jest doklejony na sztywno.
- **Dowód:** tekst nagłówka kryzysu (2026-10-09): „Promień 5 km · … · 62 osoby dopasowanych”
- **Propozycja:** Zmienić szyk na „dopasowano: 62 osoby” albo dodać w `src/lib/crisis-format.ts` funkcję zwracającą całą frazę; miejsca: `kryzys/[id].astro:84,106`, `zespoly.astro:129`, `kontakty.astro:120`, `EndCrisisDialog.astro:35`.
- **Poprawka:** `matchedWord()` w `src/lib/crisis-format.ts` (testy w `crisis-format.test.ts`): „1 osoba dopasowana”, „62 osoby dopasowane”, „61 osób dopasowanych”, we wszystkich czterech miejscach i w oknie zakończenia.
- **Weryfikacja (2026-10-09):** strona kryzysu i okno: „61 osób dopasowanych”.

### QA-027 · K-12 · UX · kosmetyczne
- **Status:** naprawione (2026-10-09) — poprawka niezacommitowana, do potwierdzenia w kolejnym przebiegu QA
- **Widok:** desktop
- **Kroki:** Kryzys „Powódź” 2 km (34 osoby), `/zespoly?szablon=punkt-medyczny&liczba=10`.
- **Oczekiwane:** Czytelna informacja o niekompletnych zespołach i brakujących rolach.
- **Faktycznie:** „Pełne zespoły: 6 z 10”, potem zespoły 1–6 i „Zespół 7 · niepełny · Brakuje: Logistyk”. O zespołach 8–10 strona nic nie mówi: po prostu ich nie ma. Brakującej roli w niepełnym zespole odpowiada tylko „LOGISTYK / brak”. Wynik jest poprawny, ale trzeba się domyślić, że trzech zespołów nie da się złożyć w ogóle. Przy pustej liście jest jasne „Nikt z listy dopasowanych nie pasuje do tego szablonu.”
- **Dowód:** `zrzuty/2026-10-09/K-12-desktop.jpg`
- **Propozycja:** Pod listą zespołów w `src/pages/koordynator/kryzys/[id]/zespoly.astro` dodać „Zespołów 8–10 nie da się złożyć: brakuje osób z rolą …”, albo w podsumowaniu „6 pełnych, 1 niepełny, 3 niezłożone”.
- **Poprawka:** Podsumowanie „Pełne zespoły: 4 z 10 · niepełne: 1 · niezłożone: 5” i pod listą „Zespołów 6–10 nie da się złożyć: na liście dopasowanych brakuje osób z rolą …”.
- **Weryfikacja (2026-10-09):** K1, `punkt-medyczny`, 10 zespołów.

### QA-007 · G-05 · UX · kosmetyczne
- **Status:** naprawione (2026-10-07) — poprawka niezacommitowana; sprawdzona w przeglądarce na `/mapa`. Pole kodu w profilu i w formularzu kryzysu (`LocationPicker`) dostało tę samą walidację: do sprawdzenia w sekcjach C (U-15) i E (K-06).
- **Widok:** desktop + 375 px
- **Kroki:** `/mapa`, w polu kodu wpisz `abc`.
- **Oczekiwane:** Podpowiedź formatu 00-000.
- **Faktycznie:** Brak jakiejkolwiek reakcji (status pusty). Nieznany kod `99-999` daje poprawnie „Nie znamy tego kodu pocztowego.” Na telefonie `inputmode="numeric"` ogranicza problem.
- **Dowód:** odczyt `#map-postcode-status` = „” (2026-10-07); po poprawce `zrzuty/2026-10-07/G-05-desktop-po-poprawce.jpg`
- **Propozycja:** Przy 6 znakach niepasujących do wzorca pokazać „Podaj kod w formacie 00-000.” (`handlePostcodeChange` w `DensityMap.tsx`).

- **Poprawka:** wspólny moduł `src/lib/postcode.ts` (`checkPostcodeInput`, `normalisePostcode`, `POSTCODE_ERROR`) z testami w `postcode.test.ts`. `abc` → komunikat od razu, niedokończony kod (`31-0`) → komunikat po wyjściu z pola, poprawny kod → wyszukiwanie; `aria-invalid` na polu. Walidacja formularzy (`validation/profile.ts`, `validation/crisis.ts`), `/api/kody-pocztowe` i `ProfileForm` używają tego samego modułu.
- **Weryfikacja w profilu (U-15, 2026-10-07):** `abc` → „Podaj kod pocztowy w formacie 00-000.” od razu, `aria-invalid`, zapis zablokowany po stronie klienta; `31001` przyjęty i wyszukany.
- **Weryfikacja w formularzu kryzysu (K-06, 2026-10-09):** `abc` → ten sam komunikat od razu, `aria-invalid="true"`, „Aktywuj” nieaktywny; `99-999` → „Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.”

## Wyniki scenariuszy (ostatni przebieg każdego ID)

| ID | Desktop | 375 px | Wynik | Znaleziska | Data |
|---|---|---|---|---|---|
| G-01 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-004 | 2026-10-07 |
| G-02 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-005 | 2026-10-07 |
| G-03 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-006 | 2026-10-07 |
| G-04 | ✓ | ✓ | OK | — | 2026-10-07 |
| G-05 | ✓ | ✓ | OK (po poprawce QA-007) | QA-007 (naprawione) | 2026-10-07 |
| G-06 | ✓ | ✓ | ZNALEZISKA | QA-008 | 2026-10-07 |
| G-07 | ✓ | — | OK | — | 2026-10-07 |
| G-08 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-002, QA-009, QA-010 | 2026-10-07 |
| G-09 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-005, QA-009 | 2026-10-07 |
| G-10 | ✗ | ✗ | ZNALEZISKA | QA-003 | 2026-10-07 |
| U-01 | ✓ | — | ZNALEZISKA | QA-016 | 2026-10-07 |
| U-02 | ✓ | — | OK | — | 2026-10-07 |
| U-03 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-011, QA-013 | 2026-10-07 |
| U-04 | ✓ | ✗ | ZNALEZISKA | QA-001 | 2026-10-07 |
| U-05 | ✓ | — | OK | — | 2026-10-07 |
| U-06 | ✓ | — | ZNALEZISKA | QA-012, QA-014 | 2026-10-07 |
| U-07 | ✓ | — | ZNALEZISKA | QA-011 | 2026-10-07 |
| U-08 | ✓ | — | OK | — | 2026-10-07 |
| U-09 | — | — | POMINIĘTE | opcjonalny (wymaga zmiany wersji zgody w bazie) | 2026-10-07 |
| U-10 | ✓ | — | ZNALEZISKA | QA-015 | 2026-10-07 |
| U-11 | ✓ | — | OK | — | 2026-10-07 |
| U-12 | ✓ | — | ZNALEZISKA | QA-020 | 2026-10-07 |
| U-13 | ✓ | — | OK | — | 2026-10-07 |
| U-14 | ✓ | — | OK | — | 2026-10-07 |
| U-15 | ✓ | — | ZNALEZISKA | QA-017 | 2026-10-07 |
| U-16 | ✓ | — | ZNALEZISKA | QA-021 | 2026-10-07 |
| U-17 | ✓ | — | ZNALEZISKA | QA-017 | 2026-10-07 |
| U-18 | ✓ | — | ZNALEZISKA | QA-018 | 2026-10-07 |
| U-19 | ✓ | — | ZNALEZISKA | QA-019 | 2026-10-07 |
| U-20 | ✓ | — | OK | — | 2026-10-07 |
| U-21 | ✓ | — | OK | — | 2026-10-07 |
| U-22 | — | ✗ | ZNALEZISKA | QA-001 | 2026-10-07 |
| U-23 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-021 | 2026-10-07 |
| U-24 | ✓ | ✓ | OK | — | 2026-10-09 |
| U-25 | ✓ | — | ZNALEZISKA | QA-022 | 2026-10-09 |
| U-26 | ✓ | — | OK | — | 2026-10-09 |
| U-27 | ✓ | ✓ | OK | — | 2026-10-09 |
| U-28 | — | — | POMINIĘTE | — | 2026-10-09 |
| U-29 | ✓ | — | OK | — | 2026-10-09 |
| U-30 | ✓ | — | OK | — | 2026-10-09 |
| U-31 | ✓ | — | OK | — | 2026-10-09 |
| K-01 | ✓ | — | OK | — | 2026-10-09 |
| K-02 | ✓ | — | OK | — | 2026-10-09 |
| K-03 | ✓ | ✓ | ZNALEZISKA | QA-023 | 2026-10-09 |
| K-04 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-025 | 2026-10-09 |
| K-05 | ✓ | — | ZNALEZISKA | QA-025 | 2026-10-09 |
| K-06 | ✗ | — | ZNALEZISKA | QA-024 | 2026-10-09 |
| K-07 | ✓ | — | OK | — | 2026-10-09 |
| K-08 | ✓ | — | OK | — | 2026-10-09 |
| K-09 | ✓ | — | OK | — | 2026-10-09 |
| K-10 | ✓ | — | OK | — | 2026-10-09 |
| K-11 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-025 | 2026-10-09 |
| K-12 | ✓ | — | ZNALEZISKA | QA-027 | 2026-10-09 |
| K-13 | ✓ | — | OK | — | 2026-10-09 |
| K-14 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-025 | 2026-10-09 |
| K-15 | ✓ | — | OK | — | 2026-10-09 |
| K-16 | ✓ | ✓ | OK | — | 2026-10-09 |
| K-17 | ✓ | — | ZNALEZISKA | QA-026 | 2026-10-09 |
| K-18 | ✓ | ✗ | ZNALEZISKA | QA-001, QA-025 | 2026-10-09 |
| K-19 | ✓ | — | OK | — | 2026-10-09 |
| K-20 | ✓ | — | OK | — | 2026-10-09 |
| K-21 | — | ✗ | ZNALEZISKA | QA-001 | 2026-10-09 |
| P-01 | ✓ | ✓ | ZNALEZISKA | QA-003, QA-004 | 2026-10-09 |
| P-02 | ✓ | — | OK | — | 2026-10-09 |
| P-03 | ✓ | ✓ | OK | — | 2026-10-09 |
| P-04 | ✓ | ✓ | OK | — | 2026-10-09 |
| P-05 | ✓ | — | ZNALEZISKA | QA-028 | 2026-10-09 |
| P-06 | ✓ | — | OK | — | 2026-10-09 |
| P-07 | — | — | POMINIĘTE | — | 2026-10-09 |
| P-08 | — | — | POMINIĘTE | — | 2026-10-09 |

## Przebiegi

| Data | Zakres | Środowisko | Stan startowy | OK | Znaleziska | Pominięte | Uwagi |
|---|---|---|---|---|---|---|---|
| 2026-10-07 | A | lokalnie (+ podgląd 404 na prod) | 500 profili, 0 aktywnych kryzysów, brak kont `@skillnet.test` | 2 | 8 | 0 | G-07: `/api/mapa` zwraca tylko `cell` + `band`, `Cache-Control: private, max-age=300`, nieznana kategoria → 400 po polsku. Poziomy scroll na 375 px: brak na wszystkich stronach. |
| 2026-10-07 | B | lokalnie | 500 profili, 0 aktywnych kryzysów, brak kont `@skillnet.test` | 2 | 7 | 1 | Hasło M1 wpisuje użytkownik (odczyt `docs/qa/.konta.local` zablokowany przez filtr uprawnień). Założone konta: `m1@skillnet.test` (hasło użytkownika) i jednorazowe `u01@skillnet.test` (fikcyjne hasło, do obejrzenia przekierowania po rejestracji); oba mają wpis zgody `2026-10-06 / signup`. Sprawdzone: brak zgody blokuje rejestrację w przeglądarce i na serwerze; nieważne linki → `/auth/link-wygasl` z `no-store`; ponowne wysłanie linku nie zdradza, czy konto istnieje; złe hasło daje ten sam komunikat dla istniejącego i nieistniejącego konta; logowanie M1 → `/profil` (profil niekompletny); `/zgoda` z aktualną zgodą → `/`; wylogowanie działa. Uwaga: lokalnie rejestracja na zajęty adres mówi „Konto … już istnieje” (ujawnia istnienie konta); na produkcji z potwierdzaniem maila GoTrue zwykle tego nie ujawnia — do sprawdzenia przez użytkownika w P-07. |
| 2026-10-07 | C | lokalnie | 500 profili, 0 aktywnych kryzysów, konta `m1@` i `u01@skillnet.test`, profil M1 pusty (brak wiersza w `profiles`) | 5 | 8 | 0 | Hasło M1 znowu wpisał użytkownik w panelu przeglądarki (filtr uprawnień blokuje odczyt `.konta.local` i przeniesienie sesji z `curl`). Sprawdzone w bazie: umiejętności z poziomami (`elektryk:3`, `ratownik-medyczny:1`, `agregat-pradotworczy` bez poziomu); kod pocztowy nie jest zapisywany (`profiles.postcode` = NULL, brak w logach serwera); pinezka przyciągana do środka kwadratu 500 m w EPSG:2180; telefon zapisany jako E.164, usunięcie kasuje wiersz `profile_contacts`; pusta siatka dostępności → `availability_slots` = NULL. Serwer odrzuca pustą pinezkę („Zaznacz lokalizację na mapie.”), punkt za granicą („Lokalizacja musi być w Polsce.”) i `+49…` bez zmiany danych. Kwadrat M1 ma 25 osób z M1, `/api/mapa` daje dla niego pasmo 3 (bez M1 byłoby 2). Plan do aktualizacji: profil nie ma przełącznika „tryb pinezki” (kod i mapa są jednocześnie), więc „pinezka bez kliknięcia” z U-17 jest osiągalna tylko przez HTTP. Stan końcowy M1: profil kompletny (pinezka w Krakowie, 3 umiejętności), bez telefonu, bez dostępności. Poziomy scroll na 375 px: brak (`/profil`, `/mapa`). |
| 2026-10-09 | D | lokalnie | 501 profili, 0 aktywnych kryzysów, konta `m1@` i `u01@skillnet.test`, M1 z kompletnym profilem, niewstrzymany; sesja M1 aktywna w panelu przeglądarki | 3 | 1 | 1 | U-24: w bazie `paused_until = 2026-10-16`, `profile_is_matchable` = false; w kwadracie 2 km M1 liczy się 24 z 25 osób, więc M1 znika z mapy. U-26: brak daty, wczoraj (2026-10-08) i dziś + 367 dni (po usunięciu `min`/`max`) → „Wybierz datę od dziś do roku naprzód.”, stan w bazie bez zmian; pole nie ma `required`, więc pusta data idzie na serwer. Dodatkowo granica dziś + 365 (2027-10-09) przyjęta. U-27: `paused_at`/`paused_until` = NULL, M1 znowu w dopasowaniach. U-28 POMINIĘTE: brak konta z niekompletnym profilem, do którego mam dostęp (hasło `u01@` nieznane), a tymczasowe zdjęcie umiejętności M1 w lokalnej bazie zablokował filtr uprawnień. Kod (`src/pages/profil.astro:113`) pokazuje komunikat także dla konta bez wiersza `profiles` (`get_my_profile` zwraca `complete=false`). 375 px na `/profil` w stanie wstrzymanym: brak poziomego scrolla, przyciski i etykiety radio 48 px. Konsola bez błędów. Stan końcowy M1: profil kompletny, dostępność wznowiona. |
| 2026-10-09 | E | lokalnie | 501 profili, 0 kryzysów, konta `m1@`, `u01@` i `k1@skillnet.test` (K1 założony przez UI tuż przed sekcją, hasło wpisał użytkownik; wpis zgody `2026-10-06 / signup`), K1 bez roli, w panelu zalogowany K1 | 11 | 10 | 0 | K-01 wykonany na K1 przed nadaniem roli (mieszkaniec bez roli; M1 był wylogowany przez rejestrację K1): `/koordynator`, strona kryzysu, `/kontakty`, `/zespoly` → 403 „Brak dostępu” w tym samym URL, `private, no-store`; POST na `/api/koordynator/kryzysy` i `/zakoncz` też 403. K-02: `grant_coordinator('k1@skillnet.test', 'local QA 2026-10-09')`, wpis `grant` w `coordinator_role_events`. K-03: sekcja „Zakończone” pojawia się dopiero, gdy jest co pokazać (po K-18). K-04: odpowiedź ok. 50 ms. K-07: kod 38-713 (Bieszczady) zamiast pinezki, pinezka sprawdzona w K-05. K-08: HTML listy bez e-maili, telefonów, współrzędnych, `score`, `user_id`; jedyny UUID to identyfikator kryzysu. K-09: M1 na miejscu 3 (w bazie `position = 3`), widać tylko umiejętności związane z kryzysem. K-10 (dokończony po sekcji, hasła przy przelogowaniach M1 ↔ K1 wpisywał użytkownik): M1 wstrzymał bezterminowo → u K1 lista ma 61 osób, numeracja 1, 2, 4… (M1 był na miejscu 3), M1 znika też z zespołów (zastąpił go #4); wiersz M1 w `crisis_matches` zostaje (`position = 3`). Po wznowieniu: 62 osoby, M1 znowu #3, zespoły identyczne jak przed wstrzymaniem. Rozbieżność z planem: strona nie ma „licznika ukrytych” — zgodnie z projektem (`20261006120000_pause_availability.sql`: „Nothing tells a coordinator that someone paused”); jedynym śladem jest przerwa w numeracji miejsc. K-13: także `liczba=2.5`, brak parametrów, próba wstrzyknięcia HTML w `liczba` (wartość zakodowana w atrybucie, bez elementu). K-15: także powód z samych spacji. K-16: 40 numerów + „Bez numeru telefonu: 22 osoby” (= 62); odświeżenie po POST zapisało drugie ujawnienie; trzecie przy sprawdzaniu widoku 375 px; nieudane próby (K-15) i POST na zakończony kryzys (K-19) nie zapisały nic. Razem 3 ujawnienia (120 numerów) w `contact_reveal_events`. Konsola: tylko odpowiedzi 403/404/422 z celowych zapytań. Stan końcowy: aktywne kryzysy „Awaria prądu” 5 km przy 31-001 (62 osoby, z M1), „Powódź” 2 km (34), „Pożar” 1 km w Bieszczadach (0); zakończony kryzys z epicentrum w Czechach (QA-024). Aktywne zostają do U-30/U-31 i kończy się je po sekcji F. |
| 2026-10-09 | P | produkcja (https://skillnet.barwy.workers.dev), tylko odczyt | 0 kwadratów na mapie (brak seeda), bez logowania | 4 | 2 | 2 | Bez wysyłania formularzy, bez kont i logowania. P-01: brak banera konfiguracji; `/`, `/mapa`, `/prywatnosc`, `/brak-dostepu` (403 po polsku) działają; nadal widoczne otwarte QA-004 („kiedy jesteś dostępny”) i QA-003 (`/nieistnieje` → angielskie „404: Not Found”). Poprawki QA-007 nie ma na produkcji (jest niezacommitowana): `abc` w polu kodu nie daje komunikatu — to nie regresja. `31-001` działa, `99-999` → „Nie znamy tego kodu pocztowego.”, filtr „Medyczne” dostaje `aria-pressed=true`. `/api/mapa?kategoria=xyz` → 400 „Nieznana kategoria umiejętności.”. P-02: `/profil`, `/dashboard`, `/zgoda`, `/koordynator`, `/koordynator/kryzys/<uuid>` → 302 `/auth/signin`. P-03: `/api/mapa` = `[]`, strona mówi „Brak obszarów z co najmniej 5 osobami dla tego filtra.” (oczekiwane). P-04: logowanie i rejestracja po polsku; link „Informacja o przetwarzaniu danych” otwiera `/prywatnosc` w nowej karcie (`noopener`) i nie zaznacza zgody. `/prywatnosc` na produkcji ma dopisek „Wersja robocza. Treść czeka na przegląd prawny przed uruchomieniem pilotażu.” — do zamknięcia przed pilotażem. P-05: anonimowe 302 z tras chronionych nie mają `Cache-Control` (tak samo lokalnie; po zalogowaniu middleware ustawia `private, no-store`, sprawdzone lokalnie w sekcji E); brak nagłówków bezpieczeństwa → QA-028. P-06: `BASE_URL=… SMOKE_READONLY=1 npm run smoke` → 26/26 PASS (plan i CLAUDE.md mówią o „dwóch krokach” — nieaktualne). 375 px: brak poziomego scrolla na `/`, `/mapa`, `/prywatnosc`, `/auth/signin`, `/auth/signup`. Konsola: tylko 400/403/404 z celowych zapytań. P-07, P-08: POMINIĘTE — wykonuje użytkownik na własnym koncie. |
| 2026-10-09 | F | lokalnie | M1 z kompletnym profilem, niewstrzymany, w 2 aktywnych kryzysach (`crisis_matches` = 2), 1 wpis zgody; 501 profili; 3 aktywne kryzysy | 3 | 0 | 0 | Potwierdzenie użytkownika przed sekcją. Hasła M1 i K1 wpisywał użytkownik. U-29: celowo złe hasło (wartość testowa, nie hasło M1) → `/profil?error=Nieprawidłowe hasło.`, konto, profil i wpisy w kryzysach bez zmian. U-30: poprawne hasło wpisał użytkownik → `/?konto-usuniete=1`, „Twoje konto i dane zostały usunięte.”, brak sesji; w bazie 0 wierszy M1 w `auth.users`, `auth.identities`, `auth.sessions`, `profiles`, `profile_skills`, `profile_contacts`, `crisis_matches`, `user_roles`; `consent_events` zachowuje 1 wiersz z samym identyfikatorem; profili 500. Logowanie M1 → „Nieprawidłowy e-mail lub hasło” (sprawdził użytkownik). Logi serwera bez e-maila M1 i bez błędów. U-31: u K1 „Awaria prądu” 62 → 61 osób (miejsce 3 znika), „Powódź” 34 → 33; dawny kwadrat M1 w `/api/mapa` z pasma 3 (25+) na 2 (10–24). Uwaga: `/api/mapa` ma `Cache-Control: private, max-age=300`, więc przeglądarka może pokazywać starą mapę do 5 min — liczby są w przedziałach, więc to nie znalezisko. Zakończone kryzysy w panelu pokazują zamrożoną liczbę z chwili aktywacji (62 i 34), zgodnie z projektem. Sprzątanie: 3 aktywne kryzysy z sekcji E zakończone przez UI (K-18), `crises` aktywnych = 0, `crisis_matches` = 0. Konta testowe po przebiegu: `k1@skillnet.test` (rola koordynatora), `u01@skillnet.test`; M1 nie istnieje — kolejny przebieg zaczyna się od U-01. |

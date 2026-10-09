---
name: "skillnet-qa"
description: "Testy manualne SkillNet według planu z repo: przechodzi wskazaną sekcję lub scenariusze i zapisuje znaleziska do jednego pliku z poprawkami. Użyj przy /skillnet-qa, „przetestuj sekcję E”, „QA SkillNet”."
---

# SkillNet — testy manualne

Przechodzisz scenariusze z planu testów SkillNet w przeglądarce i zapisujesz wynik do JEDNEGO pliku z poprawkami. Nie poprawiasz kodu w trakcie przebiegu: tylko testujesz i raportujesz. Poprawki robi się osobno, na podstawie pliku (triage jak w CLAUDE.md: fix / skip / accept / lesson / disagree).

## Pliki

| Plik | Rola |
|---|---|
| `docs/qa/plan-testow-manualnych.md` | Plan: scenariusze z ID, kroki, oczekiwany wynik. Źródło prawdy, czytasz go przy każdym uruchomieniu. Jedyne, co w nim zmieniasz, to tabela „Stan przebiegu” i znaczniki w nagłówkach sekcji (krok 6 w „Przebiegu sekcji”). |
| `docs/qa/poprawki.md` | Jedyny plik wynikowy. Tworzysz go z szablonu poniżej, jeśli nie istnieje; potem tylko aktualizujesz. |
| `docs/qa/zrzuty/<RRRR-MM-DD>/` | Zrzuty ekranu jako dowody: `<ID>-<desktop|375>.jpg`. |
| `docs/qa/.konta.local` | Hasła kont testowych M1 i K1 (gitignored). Patrz Zasady bezpieczeństwa, pkt 3. |

Jeśli planu nie ma pod tą ścieżką, poszukaj go w `docs/` (`grep -rl "Plan testów manualnych" docs`). Jeśli nadal go nie ma, zapytaj użytkownika i nie zgaduj scenariuszy.

## Argumenty

`/skillnet-qa <zakres> [prod]`

- Zakres to litera sekcji (`A`, `B`, `C`, `D`, `E`, `F`, `P`), kilka liter (`A B`), pojedyncze ID (`K-04`) lub przedział (`U-11..U-17`).
- Bez zakresu zapytaj, którą sekcję przejść. Całego planu naraz nie uruchamiaj: przechodź sekcja po sekcji i zapisuj plik po każdej.
- `prod` dotyczy tylko sekcji P (patrz Zasady bezpieczeństwa).

## Zasady bezpieczeństwa (zawsze)

1. **Produkcja** (`https://skillnet.barwy.workers.dev`): wykonujesz tylko P-01…P-06, czyli odczyt. Nie wysyłasz formularzy, nie zakładasz kont, nie logujesz się, nie nadajesz ról, nie aktywujesz kryzysów. P-07 i P-08 oznaczasz jako „POMINIĘTE — wykonuje użytkownik”.
2. **Sekcja F** (usuwanie konta) jest nieodwracalna. Przed nią zapytaj o wyraźne potwierdzenie i wykonuj ją zawsze na końcu.
3. **Hasła** kont testowych to lokalne wartości testowe. Trzymasz je w `docs/qa/.konta.local` (format `M1=...`, `K1=...`; plik jest w `.gitignore`). Jeśli pliku nie ma, przy U-01 wygeneruj losowe hasła (`openssl rand -base64 18`) i zapisz je tam. Nigdy nie wypisujesz ich w czacie, w `poprawki.md`, w zrzutach ani w opisach akcji. Nie proś użytkownika o wklejenie hasła do czatu. Nigdy nie używaj tych haseł poza `localhost`.
4. Do `poprawki.md` nie wpisujesz danych osobowych: numerów telefonów, e-maili spoza `@skillnet.test`, współrzędnych. W dowodach zastępujesz je `[ukryte]`. Nie dotykasz kont innych niż M1 i K1 (w lokalnej bazie mogą być prawdziwe konta właściciela).
5. SQL wykonujesz tylko na lokalnej bazie.

## Przygotowanie (lokalnie, przed pierwszą sekcją przebiegu)

1. Aplikacja: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/` ma zwrócić 200. Jeśli nie, uruchom serwer przez `preview_start` z konfiguracją `astro-dev` (`.claude/launch.json`). Nigdy przez Bash w tle.
2. Supabase: `npx supabase status` działa. `psql` nie jest zainstalowany na hoście, więc zapytania wykonuj przez kontener:
   `docker exec supabase_db_10x-astro-starter psql -U postgres -Atc "<sql>"`
   Sprawdź liczbę profili z seeda (ok. 500, `select count(*) from public.profiles`) i aktywnych kryzysów (`select count(*) from public.crises where status = 'active'`).
3. Konta: M1 (`m1@skillnet.test`) i K1 (`k1@skillnet.test`). Sprawdź, czy istnieją (`select email from auth.users where email like '%@skillnet.test'`). Jeśli K1 nie ma roli, a zakres obejmuje sekcję E, nadaj ją:
   `select public.grant_coordinator('k1@skillnet.test', 'local QA <data>');`
   Przy K-02 rób to w trakcie scenariusza, nie wcześniej.
4. Jeśli zakres zaczyna się od sekcji, która potrzebuje konta z wcześniejszej sekcji (np. C bez M1), poinformuj o tym i zaproponuj najpierw U-01, albo załóż konto przez UI tak jak w U-01. Po sekcji F konto M1 nie istnieje: kolejny przebieg zaczyna się od U-01.
5. Zanotuj stan startowy (liczby z pkt 2) w sekcji „Przebiegi”.

## Narzędzia przeglądarki

Domyślnie wbudowana przeglądarka aplikacji (`mcp__Claude_Browser__*`). Claude in Chrome tylko na wyraźną prośbę użytkownika.

- **Widoki (wariant odchudzony)**:
  - desktop (domyślny rozmiar panelu, min. 800 px) dla każdego scenariusza;
  - telefon 375×812 (`resize_window` z presetem `mobile`, potem przeładowanie) tylko dla scenariuszy mobilnych z planu (U-22, K-21) oraz dla **jednego przejścia każdej odwiedzonej strony** w danej sekcji (pierwsze wejście na stronę w sekcji). Po teście wróć do presetu `desktop`.
  - W tabeli wyników kolumna 375 px ma `✓`, `✗` albo `—` (nie testowano w tym widoku).
- **Konsola**: po każdym scenariuszu `read_console_messages` z `onlyErrors`. Każdy błąd JS to znalezisko (typ `błąd`). Komunikaty `[vite]` i React DevTools ignoruj.
- **Poziomy scroll** na 375 px: `javascript_tool` z `document.documentElement.scrollWidth > window.innerWidth`; `true` to znalezisko (typ `mobile`).
- **Teksty**: każdy tekst po angielsku widoczny dla użytkownika (np. komunikat Supabase) to znalezisko `tekst-i18n`. Formy tylko męskie, literówki i niespójne nazwy to też `tekst-i18n` (zwykle kosmetyczne).
- **Cele dotykowe** < 44 px na 375 px to znalezisko `a11y`.
- **Sieć**: przy scenariuszach o prywatności (G-07, K-08, K-16, P-05) sprawdź odpowiedzi API (`read_network_requests`), HTML strony i nagłówki, a nie tylko to, co widać na ekranie.
- **Zrzuty**: rób je przy każdym znalezisku (przy scenariuszach OK nie trzeba). Wynik `computer` → `screenshot` podaje ścieżkę pliku `.jpg` w katalogu sesji; skopiuj go Bashem do `docs/qa/zrzuty/<RRRR-MM-DD>/<ID>-<desktop|375>.jpg`. Przed zapisaniem sprawdź, że na zrzucie nie ma danych osobowych ani haseł (pkt 4 zasad). Numery z break-glass (K-16) to numery z seeda (`+48000…`), ale i tak ich nie utrwalaj: zrzut rób przed ujawnieniem albo zamaż.

## Przebieg sekcji

1. Przeczytaj z planu scenariusze z zakresu: ID, kroki, oczekiwany wynik.
2. Przeczytaj `docs/qa/poprawki.md` (jeśli istnieje): otwarte znaleziska dla tych ID i notatki z poprzednich przebiegów. Przy pierwszym utworzeniu pliku przenieś do niego notatki z sekcji „Notatki z wstępnego przejścia” w planie jako znaleziska (po weryfikacji), a w planie zostaw odnośnik do `poprawki.md`.
3. Wykonaj każdy scenariusz w wymaganych widokach. Wynik scenariusza to:
   - `OK`: zgodny z oczekiwanym we wszystkich testowanych widokach, bez błędów w konsoli.
   - `ZNALEZISKA`: co najmniej jedno znalezisko (scenariusz może mimo to „działać”, np. przy uwadze UX).
   - `POMINIĘTE`: z powodem (wymaga użytkownika, brak danych, zależność od nieprzeszłego scenariusza, opcjonalny).
4. Ponowna weryfikacja otwartych znalezisk:
   - otwarte znalezisko, które już nie występuje → status `naprawione (<data>)`, przenieś do sekcji „Naprawione”;
   - znalezisko z „Naprawionych”, które znowu występuje → wróć je do „Otwartych” ze statusem `regresja (<data>)`; nie twórz nowego numeru.
5. Zapisz plik po zakończeniu sekcji, a nie dopiero na końcu przebiegu.
6. Zaktualizuj stan w planie (`docs/qa/plan-testow-manualnych.md`):
   - w tabeli „Stan przebiegu” ustaw wiersz sekcji: `✅ sprawdzona`, gdy przeszły wszystkie scenariusze sekcji (pominięte z powodem się liczą), albo `🟡 częściowo`, gdy zakres obejmował tylko część ID; wpisz datę i w „Uwagach” zakres ID, pominięte scenariusze z powodem i rozbieżności między planem a aplikacją;
   - w nagłówku sekcji dopisz albo nadpisz znacznik `— ✅ sprawdzone <RRRR-MM-DD>` (lub `— 🟡 częściowo <RRRR-MM-DD> (<ID>)`), z pominiętymi ID w nawiasie;
   - jeśli tabeli „Stan przebiegu” nie ma, utwórz ją pod akapitem o skillu, z wierszem dla każdej sekcji planu (`⏳ do zrobienia` dla niesprawdzonych);
   - po sekcji F popraw w „Uwagach” wszystko, co zakłada istnienie konta M1: konto już nie istnieje i kolejny przebieg zaczyna się od U-01.
   Nie zmieniaj kroków ani oczekiwanych wyników scenariuszy. Rozbieżności planu z aplikacją tylko notujesz w „Uwagach” i w „Przebiegach” w `poprawki.md`.
7. W czacie podaj krótkie podsumowanie sekcji: liczbę OK / ZNALEZISKA / POMINIĘTE i jednym zdaniem najważniejsze nowe znaleziska.

## Sprzątanie lokalne

Kryzysy aktywowane w testach kończysz przez UI (jak w K-18) **po sekcji F**, a nie po E: U-30 i U-31 potrzebują aktywnego kryzysu z M1 na liście. Jeśli przebieg kończy się na sekcji E (bez F), zakończ kryzysy po E. Każde sprzątanie zanotuj w „Przebiegach”.

## Znalezisko

Każde znalezisko ma stały numer `QA-NNN` (kolejny wolny, nigdy nie używany ponownie) i jest przypisane do jednego ID scenariusza. Ten sam problem w kilku scenariuszach to jedno znalezisko z listą ID. (Prefiks `QA-`, bo `P-NN` to ID scenariuszy produkcyjnych.)

**Typ:** `błąd` · `UX` · `tekst-i18n` · `mobile` · `a11y` · `prywatność` · `bezpieczeństwo` · `wydajność`

**Waga:**

- `blokujące`: scenariusz nie przechodzi, wyciek danych, błąd bezpieczeństwa, utrata danych;
- `ważne`: działa, ale myli użytkownika lub wymaga obejścia; brak polskiego tekstu w ścieżce głównej;
- `kosmetyczne`: wygląd, sformułowania, drobne niespójności.

Typ `prywatność` lub `bezpieczeństwo` ma zawsze wagę `blokujące`, chyba że to wyłącznie uwaga.

Znalezisko opisuj konkretnie: co dokładnie zrobić, żeby je zobaczyć, i co dokładnie się dzieje (tekst komunikatu, kod HTTP, treść błędu z konsoli). Propozycja poprawki jest krótka i wskazuje plik lub komponent, jeśli łatwo go znaleźć w repo (`grep` po tekście komunikatu). Nie zmieniaj go.

## Szablon `docs/qa/poprawki.md`

```markdown
# SkillNet — poprawki z testów manualnych

Plan: `docs/qa/plan-testow-manualnych.md`. Plik aktualizuje skill `skillnet-qa`; numery QA-NNN są stałe.

## Podsumowanie

| Waga | Otwarte | Regresje | Naprawione |
|---|---|---|---|
| blokujące | 0 | 0 | 0 |
| ważne | 0 | 0 | 0 |
| kosmetyczne | 0 | 0 | 0 |

## Otwarte

<!-- najpierw blokujące, potem ważne, potem kosmetyczne; w obrębie wagi po ID scenariusza -->

### QA-001 · G-01 · tekst-i18n · kosmetyczne
- **Status:** otwarte (od 2026-10-07)
- **Widok:** desktop + 375 px
- **Kroki:** Otwórz `/`, sekcja hero, pierwsza karta.
- **Oczekiwane:** Tekst neutralny płciowo lub w obu formach.
- **Faktycznie:** „kiedy jesteś dostępny”, tylko forma męska.
- **Dowód:** `zrzuty/2026-10-07/G-01-desktop.jpg`
- **Propozycja:** „kiedy możesz pomóc” lub „dostępny/dostępna” (`src/components/Welcome.astro`).

## Naprawione

<!-- znaleziska przeniesione z Otwartych, ze statusem naprawione (<data>) -->

## Wyniki scenariuszy (ostatni przebieg każdego ID)

| ID | Desktop | 375 px | Wynik | Znaleziska | Data |
|---|---|---|---|---|---|
| G-01 | ✓ | ✓ | ZNALEZISKA | QA-001 | 2026-10-07 |

## Przebiegi

| Data | Zakres | Środowisko | Stan startowy | OK | Znaleziska | Pominięte | Uwagi |
|---|---|---|---|---|---|---|---|
```

Przykładowe QA-001 w szablonie to tylko wzór formatu. W nowym pliku zostaw sekcje puste i wpisuj wyłącznie to, co faktycznie sprawdziłeś.

Przy każdym zapisie przelicz tabelę „Podsumowanie” i nadpisz wiersze w „Wynikach scenariuszy” dla przetestowanych ID. Nowy wiersz w „Przebiegach” dodawaj raz na przebieg i aktualizuj go po każdej sekcji.

## Sekcja P (produkcja)

- P-01…P-04: te same sprawdzenia co G-01, G-03…G-10, G-02, formularze bez wysyłania. Pusta mapa na produkcji jest oczekiwana (P-03) i nie jest znaleziskiem.
- P-05: `curl -sI` na trasy chronione (`/profil`, `/dashboard`, `/koordynator`) i publiczne (`/`, `/mapa`, `/prywatnosc`, `/api/mapa`). Chronione: `Cache-Control: private, no-store` (anonimowo to 302 na `/auth/signin` — zapisz, co faktycznie wraca). Zapisz faktyczne nagłówki w dowodzie.
- P-06: `BASE_URL=https://skillnet.barwy.workers.dev SMOKE_READONLY=1 npm run smoke`, wynik w dowodzie. Bez `BASE_URL` smoke idzie na localhost, a bez `SMOKE_READONLY=1` zakłada konta na produkcji: nigdy nie uruchamiaj go na produkcji bez obu zmiennych.
- P-07, P-08: `POMINIĘTE — wykonuje użytkownik na własnym koncie`.

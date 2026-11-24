# S-07: lista kroków właściciela

Kroki, które wykonuje człowiek, w kolejności. Stan na 2026-11-24: kod faz 1–4 czeka w PR-ach #128–#131, nic nie jest zmergowane, nie istnieje żadna kolejka, a baza stagingu i produkcji nie ma żadnej migracji S-07.

Zasady dla całej listy:

- Wartości sekretów wpisuj tylko w pytaniu `wrangler secret put`, nigdy jako argument polecenia i nigdy na czacie.
- Każde `wrangler secret put` od razu wdraża nową wersję Workera.
- Staging i produkcja mają osobne wartości każdego sekretu. Wartość produkcyjna na stagingu sprawiłaby, że staging wysyła z produkcyjnego konta.
- Dopóki Worker nie ma `SMSAPI_TOKEN`, aplikacja używa fałszywego providera i nie wysyła żadnego SMS-a. Merge kodu przed krokami z części C jest więc bezpieczny.

## A. Przed mergem #128 (faza 1)

- [ ] **A1. Włącz plan Workers Paid** w panelu Cloudflare (5 USD miesięcznie za konto, obejmuje oba Workery).
  - Cennik Cloudflare z 2026-11-24 pokazuje Queues także w planie Free, więc sama kolejka może już nie wymagać Paid; nie zostało to sprawdzone wdrożeniem. Paid jest potrzebny i tak: limit 10 ms CPU i 50 podzapytań na Free ucina wysyłkę alertów.
- [ ] **A2. Utwórz kolejki stagingu.** Bez nich deploy stagingu po mergu #128 się nie powiedzie.

  ```bash
  npx wrangler queues create skillnet-sms-alerts-staging
  ```

  ```bash
  npx wrangler queues create skillnet-sms-alerts-staging-dlq
  ```

- [ ] **A3. Sprawdź:** `npx wrangler queues list` pokazuje obie kolejki.
- [ ] **A4. Daj znać, że #128 można mergować.**

## B. Merge stosu do `master` (fazy 2–4)

Dla każdego z #129, #130, #131, po kolei:

- [ ] zmiana bazy PR-a na `master`, zielone `ci`, `smoke` i `audit`,
- [ ] `npm run db:push:staging` z migracją tego PR-a (wymaga `.staging-db-url` w tym worktree),
- [ ] merge,
- [ ] sprawdzenie na https://staging.skillnet.org.pl, że strony `/profil` i kryzysu koordynatora działają.

| PR   | Migracja                              |
| ---- | ------------------------------------- |
| #129 | `20261030120000_phone_verification`   |
| #130 | `20261030130000_crisis_alerts`        |
| #131 | `20261030140000_crisis_alert_replies` |

Te kroki mogę wykonać ja, gdy potwierdzisz każdy merge. Do czasu części C staging nie dokończy weryfikacji numeru: wdrożona wersja na fałszywym providerze nie pokazuje kodu.

## C. Konto SMSAPI

- [ ] **C1. Załóż konto na smsapi.pl** (prepaid, bez abonamentu). Minimalne doładowanie to 49 zł netto, SMS kosztuje wtedy 0,17 zł netto.
- [ ] **C2. Zamów dedykowany numer odbiorczy (9 cyfr).** Bez niego mieszkaniec nie może odpisać TAK/NIE. Cena z cennika: 99 zł netto miesięcznie przy umowie na 12 miesięcy, 149 zł bezterminowo.
- [ ] **C3. Zapytaj SMSAPI** (jedna wiadomość do działu obsługi):
  - czy jest opłata aktywacyjna za numer odbiorczy,
  - czy numer odbiorczy może być jednocześnie nadawcą alertów, tak żeby odpowiedź na SMS trafiała na ten numer,
  - czy subkonto może mieć własny numer odbiorczy, własne adresy callbacków i ile to kosztuje,
  - czy środki prepaid wygasają,
  - jaki jest limit wysyłek na sekundę przez API,
  - jak długo SMSAPI przechowuje treść wiadomości i numery (potrzebne do polityki prywatności).
- [ ] **C4. Zapytaj SMSAPI i CERT Polska,** czy nadawca wymaga rejestracji według przepisów o zwalczaniu nadużyć w komunikacji elektronicznej.
- [ ] **C5. Zdecyduj o stagingu.** Żadna wiadomość nie niesie własnego adresu raportu, więc jedno konto wysyła wszystkie raporty i odpowiedzi do jednego środowiska.
  - Wariant 1: osobne konto albo subkonto z własnym numerem dla stagingu (drugi numer, około 99 zł netto miesięcznie więcej).
  - Wariant 2: tylko produkcja ma konto. Staging zostaje na fałszywym providerze, a test na prawdziwym telefonie odbywa się wyłącznie na produkcji.
- [ ] **C6. Utwórz token API (OAuth) ograniczony do wysyłki SMS.** Osobny dla każdego środowiska, które ma konto.

## D. Sekrety i token workera (dla każdego środowiska z osobna)

Kolejność w ramach jednego środowiska: najpierw migracja z #129 w bazie (tworzy `private.worker_tokens`), potem D1–D4.

- [ ] **D1. Wygeneruj token workera.** Polecenie wypisuje sam hash, a token trafia do schowka:

  ```bash
  TOKEN=$(openssl rand -hex 32); printf %s "$TOKEN" | shasum -a 256; printf %s "$TOKEN" | pbcopy; unset TOKEN
  ```

- [ ] **D2. Wklej token ze schowka jako sekret `SMS_WORKER_TOKEN`.**
  - Staging: `npx wrangler secret put SMS_WORKER_TOKEN --name skillnet-staging`
  - Produkcja: `npx wrangler secret put SMS_WORKER_TOKEN`
- [ ] **D3. Wstaw hash do bazy tego środowiska** (Studio → SQL editor). Wstawiasz tylko 64-znakowy hash, nigdy sam token:

  ```sql
  insert into private.worker_tokens (name, token_hash) values ('sms_worker', '<hash z D1>');
  ```

- [ ] **D4. Wygeneruj sekret webhooków** (`openssl rand -hex 32 | pbcopy`) i ustaw go jako `SMS_WEBHOOK_SECRET` tym samym sposobem co w D2. Zapisz go też w menedżerze haseł: będzie potrzebny w E1.
- [ ] **D5. Ustaw `SMSAPI_TOKEN`** tokenem z C6. Od tej chwili to środowisko wysyła prawdziwe SMS-y.
- [ ] **D6. Opcjonalnie `SMSAPI_SENDER`,** jeśli SMSAPI każe podać nadawcę inny niż domyślny dla konta. To zwykła zmienna, nie sekret.

## E. Callbacki w panelu SMSAPI (dla każdego konta z osobna)

- [ ] **E1. Adres raportów doręczeń:** `https://<host>/api/sms/raport/<SMS_WEBHOOK_SECRET>`
- [ ] **E2. Adres odbioru odpowiedzi, metoda POST:** `https://<host>/api/sms/odpowiedz/<SMS_WEBHOOK_SECRET>`

`<host>` to `skillnet.org.pl` dla produkcji i `staging.skillnet.org.pl` dla stagingu. Staging stoi za Cloudflare Access, więc callbacki SMSAPI do niego nie dotrą, dopóki te dwie ścieżki nie dostaną w Access reguły omijającej (bypass). To zmiana zabezpieczeń stagingu: zrób ją tylko przy wariancie 1 z C5.

- [ ] **E3. Sprawdź,** że zły sekret w adresie daje 404, a poprawny adres raportu odpowiada `OK`.

## F. Promocja na produkcję

- [ ] **F1. Utwórz kolejki produkcyjne** przed mergem PR-a promocyjnego:

  ```bash
  npx wrangler queues create skillnet-sms-alerts
  ```

  ```bash
  npx wrangler queues create skillnet-sms-alerts-dlq
  ```

- [ ] **F2. Zakończ kryzys otwarty na produkcji od 2026-10-20** albo świadomie go zostaw. Nie promujemy podczas aktywnego kryzysu.
- [ ] **F3. Tuż przed mergem promocji:** `npx supabase migration list --linked`, potem `npx supabase db push`. Mają wejść dokładnie trzy migracje z tabeli w części B.
- [ ] **F4. Merge PR-a promocyjnego** `master` → `production` zwykłym merge commitem.
- [ ] **F5. Kroki D1–D5 i E1–E3 dla produkcji.**
- [ ] **F6. Smoke tylko do odczytu** po deployu na 100%:

  ```bash
  SMOKE_READONLY=1 BASE_URL=https://skillnet.org.pl npm run smoke
  ```

## G. Test na prawdziwym telefonie (produkcja)

W drugim oknie: `npx wrangler tail skillnet --format json --status error`.

- [ ] **G1.** Zweryfikuj własny numer na `/profil` kodem z SMS-a.
- [ ] **G2.** Aktywuj prawdziwy kryzys (nie ćwiczenie) w pustej okolicy, tak żebyś pasował tylko Ty, i wyślij alert do 1 osoby.
- [ ] **G3.** SMS przychodzi. Odpisz `TAK`: jesteś na górze listy. Odpisz `NIE`: spadasz na dół.
- [ ] **G4.** Zakończ kryzys i odpisz jeszcze raz: przychodzi „akcja zakończona”.
- [ ] **G5.** Sprawdź status doręczenia na stronie kryzysu, wpis w audycie partii i czas od wysyłki do `TAK` (ma być poniżej 5 minut).
- [ ] **G6.** Panel SMSAPI pokazuje doręczoną wiadomość i odebrane odpowiedzi.
- [ ] **G7.** Podaj mi wyniki bez numerów telefonów; spiszę je w `e2e-results.md`.

## H. Decyzje po pierwszym prawdziwym raporcie

- [ ] **H1. Logi Workers.** Otwórz Workers Logs i sprawdź, czy log wywołania pokazuje adres `/api/sms/raport/…`. Ten adres zawiera `SMS_WEBHOOK_SECRET` w ścieżce i numer odbiorcy (`to`) w query. Jeśli tak, wybierz:
  - wyłączyć logi wywołań (`observability.logs.invocation_logs: false` w `wrangler.jsonc`; znikają też logi żądań używane przy diagnozie), albo
  - zostawić je i opisać to w polityce prywatności.

  W obu przypadkach sekret jest czytelny dla każdego z dostępem do panelu Cloudflare. Zmień go, gdy ta grupa się zmieni.

- [ ] **H2. Inspektor ochrony danych.** Zapytaj, czy zmiana polityki prywatności (SMSAPI jako podmiot przetwarzający) wymaga nowej wersji zgody, i przekaż odpowiedź SMSAPI o czasie przechowywania wiadomości (C3).

## Gdyby coś poszło źle

- **Wyłączenie prawdziwych SMS-ów:** `npx wrangler secret delete SMSAPI_TOKEN` (dla stagingu z `--name skillnet-staging`). Aplikacja wraca na fałszywego providera.
- **Hamulec kosztów:** konto ma limit 1000 SMS dziennie (około 170 zł netto), a jeden kryzys najwyżej 500 alertów.
- **Wycofanie wersji:** `npx wrangler rollback <version-id> --message "<powód>"`. Nie cofa migracji ani sekretów.

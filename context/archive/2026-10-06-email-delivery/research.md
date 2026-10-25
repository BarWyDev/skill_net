# S-16 email-delivery: research decyzyjny

Data researchu: **2026-10-21**. Kurs NBP (tabela A 205/A/NBP/2026, 2026-10-21): **1 USD = 3,8889 PLN**, **1 EUR = 4,3641 PLN** ([api.nbp.pl](https://api.nbp.pl/api/exchangerates/rates/a/usd/last/3/?format=json)). Wszystkie ceny sprawdzone 2026-10-21, chyba że zaznaczono inaczej. „Brutto" = netto × 1,23. Dostawcy z USA często nie doliczają polskiego VAT osobie fizycznej (albo stosują odwrotne obciążenie dla firmy), więc kwotę brutto traktuj jako górną granicę.

Legenda pewności: ✅ potwierdzone w oficjalnym źródle · ⚠️ źródło wtórne albo niepełne · ❓ niepotwierdzone.

---

## 1. Rekomendacja w 10 linijkach

1. **Domena (decyzja §7):** **`skillnet.org.pl`** w **OVHcloud** na organizację: 15,85 PLN brutto w roku 1, 53,12 PLN brutto przy odnowieniu, **122,09 PLN brutto za 3 lata** ✅. (`skillnet.pl` jest zajęta.) DNS przenieś na **Cloudflare** (darmowa strefa).
2. Wariant tańszy i „wszystko w Cloudflare": `.com` w **Cloudflare Registrar** po kosztach, $10,46 (≈ 40,68 PLN) na rok, ≈ 122 PLN za 3 lata. Cloudflare **nie obsługuje `.pl` ani `.eu`** ✅.
3. **Wysyłka:** **Resend**, subdomena nadawcza `auth.<domena>`, region **eu-west-1 (Irlandia)**. Resend jest wymieniony w dokumentacji Supabase ✅, a śledzenie otwarć i kliknięć jest domyślnie wyłączone ✅.
4. Plan Resend: **Free** (3 000/mies., **100/dzień**) na konfigurację i test E2E, **Pro $20/mies.** od dnia ogłoszenia pilotażu, bo dzienny limit 100 maili nie wytrzyma dnia startu.
5. **Skrzynka:** **Cloudflare Email Routing** (0 zł): `kontakt@`, `dmarc@` i `support@` przekierowane na prywatną skrzynkę. Docelowo Zoho Mail Lite (ok. $1/użytk./mies. ⚠️) albo Migadu Micro ($19/rok), jeśli trzeba będzie odpowiadać z adresu w domenie.
6. **DMARC:** `p=none` + `rua=mailto:dmarc@<domena>` od dnia 1, `quarantine` po 2–4 tygodniach czystych raportów, `reject` po kolejnych 2–4.
7. **Supabase:** jeden `PATCH /v1/projects/{ref}/config/auth` (SMTP + `rate_limit_email_sent` + polski szablon). Pole `smtp_port` jest **stringiem** w OpenAPI ✅.
8. **Ryzyko w kodzie:** `/auth/confirm` wywołuje `verifyOtp` już na GET, więc skanery linków (Outlook Safe Links, bramki firmowe i urzędowe) zużyją token przed kliknięciem. Dodaj stronę z przyciskiem (POST) w zakresie S-16 (§5.6).
9. **Koszt pilotażu:** domena ≈ 1,7 PLN/mies. (20,53 PLN/rok 1) + Resend Pro 77,78 PLN netto/mies. ≈ **79,5 PLN/mies. ≈ 954 PLN w roku 1** (z kosztem domeny w roku 1; przy Resend Free ≈ 20,53 PLN/rok).
10. **Koszt przy 5k użytkowników:** ok. 15 000 maili/mies. mieści się w Resend Pro → **≈ 78–96 PLN/mies., ≈ 950–1 170 PLN/rok** (netto–brutto, z domeną).

---

## 2. Tabele porównawcze

### 2.1 Domeny (cena za rok; rok 1 → odnowienie)

| Rejestrator                   | .pl                                                   | .com                            | .eu                         | .app                      | .dev                      | .io                         | Uwagi                                                                                                                   | Źródło                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------- | ------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **OVHcloud**                  | 16,69 → 58,99 PLN netto (**20,53 → 72,56 brutto**) ✅ | 34,08 → 62,49 PLN               | 35,49 → 40,69 PLN           | 36,59 → 86,99 PLN (promo) | 36,59 → 74,49 PLN (promo) | 131,32 → 284,99 PLN (promo) | Ceny netto ✅ (dla .pl potwierdzone; reszta zakładam netto ⚠️), DNSSEC ✅, transfer .pl 0 PLN                           | [ovhcloud.com/pl/domains/tld](https://www.ovhcloud.com/pl/domains/tld/), [/pl/](https://www.ovhcloud.com/pl/domains/tld/pl/)            |
| **Cloudflare Registrar**      | ❌ brak                                               | **$10,46 → $10,46** (40,68 PLN) | ❌ brak                     | $8,20 → $14,20            | $8,20 → $12,20            | $32 → $50                   | Po kosztach, bez marży. Naliczanie VAT w UE niejasne ⚠️                                                                 | [cfdomainpricing.com](https://cfdomainpricing.com/) (aktualizacja 2026-10-21), [tld-policies](https://www.cloudflare.com/tld-policies/) |
| **Porkbun**                   | ❌ brak w cenniku                                     | $11,08 → $11,08                 | **$5,88 → $5,88**           | $8,75 → $14,93            | $8,75 → $12,87            | $28,12 → $51,80             | Darmowe WHOIS privacy ✅                                                                                                | [porkbun.com/products/domains](https://porkbun.com/products/domains)                                                                    |
| **home.pl**                   | 0,99 PLN netto (promo) → ❓                           | 19,99 PLN netto (promo) → ❓    | 6,99 PLN netto (promo) → ❓ | –                         | –                         | –                           | Odnowień nie ma na stronie. Wg agregatora: .com 39,90 PLN netto ⚠️                                                      | [home.pl/domeny](https://home.pl/domeny/), [whtop](https://www.whtop.com/pl/plans/home.pl/82857) ⚠️                                     |
| **nazwa.pl**                  | 0 PLN netto (promo, 3 pierwsze domeny) → ❓           | 40 PLN (promo) → ❓             | 10 PLN (promo) → ❓         | –                         | –                         | –                           | „Bezpieczna Domena" (DNSSEC): standard **240 PLN/rok** ✅. Ryzyko wysokiego odnowienia                                  | [nazwa.pl/cennik/cennik-domen](https://www.nazwa.pl/cennik/cennik-domen/)                                                               |
| **INWX**                      | ❓ (na zapytanie)                                     | $15,72 netto                    | $11,30 netto                | ❓                        | ❓                        | ❓                          | Ceny netto + VAT ✅                                                                                                     | [inwx.com pricelist](https://www.inwx.com/en/domain/pricelist)                                                                          |
| Namecheap, Gandi, Squarespace | ❓                                                    | ❓                              | ❓                          | ❓                        | ❓                        | ❓                          | **Nie sprawdzone** w tym researchu (brak czasu na wiarygodne pobranie cennika). Do uzupełnienia, jeśli .pl/OVH odpadnie | –                                                                                                                                       |

**.pl: osoba fizyczna a firma.** NASK nie publikuje w WHOIS danych abonentów będących osobami fizycznymi; ujawnia je tylko na pisemny wniosek przy uzasadnionym interesie prawnym ✅ ([dns.pl/en/whois/FAQ](https://www.dns.pl/en/whois/FAQ)). Dane firmy (nazwa, adres) są publiczne ✅ (implikacja tej samej strony). Usługa „privacy" rejestratora dla .pl jest więc zbędna, jeśli rejestrujesz jako osoba fizyczna.

**Koszt domeny:**

| Wariant                                                                | Rok 1                                 | 3 lata                                          |
| ---------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Najtańszy sensowny: `.pl` OVH                                          | 20,53 PLN brutto                      | **165,65 PLN brutto**                           |
| „Wszystko w Cloudflare": `.com` Cloudflare                             | ≈ 40,68 PLN (+ ewent. VAT ⚠️ → 50,04) | ≈ 122–150 PLN                                   |
| Premium: `.pl` OVH + `.com` Cloudflare (ochrona marki, przekierowanie) | ≈ 61–71 PLN                           | ≈ 288–316 PLN                                   |
| Unikać: `.pl` z promocją 0–1 zł w nazwa.pl/home.pl                     | 0–1,22 PLN                            | ❓ odnowienie nieznane, ryzyko 100–240+ PLN/rok |

### 2.2 Skrzynka / adresy kontaktowe

| Usługa                                | Cena                                                                            | Aliasy / skrzynki                                 | Wysyłka z adresu w domenie                 | Uwagi                                                                                                | Źródło                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Email Routing**          | **0 zł** ⚠️ (strona limitów nie podaje ceny wprost; usługa powszechnie darmowa) | 200 reguł/domenę, 200 adresów docelowych/konto ✅ | ❌ tylko forward (odpowiedź przez Workers) | MX na `route1-3.mx.cloudflare.net`, SPF `include:_spf.mx.cloudflare.net` ✅. Wymaga DNS w Cloudflare | [limits](https://developers.cloudflare.com/email-routing/limits/), [DNS](https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/) |
| **ImprovMX Free**                     | 0 zł; Premium $9/mies. (35,00 PLN)                                              | 1 domena, 25 aliasów, 500 forwardów/dzień ✅      | ❌ (SMTP = 0 na Free) ✅                   | Alternatywa, gdy DNS nie w Cloudflare                                                                | [improvmx.com/pricing](https://improvmx.com/pricing)                                                                                                       |
| **Zoho Mail Forever Free**            | 0 zł                                                                            | do 5 użytk., 5 GB, 1 domena ✅                    | tylko web/aplikacja; **brak IMAP/POP** ✅  | Wymaga własnej domeny. Dostępność regionalna ⚠️                                                      | [zoho pricing](https://www.zoho.com/mail/zohomail-pricing.html)                                                                                            |
| **Zoho Mail Lite**                    | ≈ $1/użytk./mies. rocznie (≈ 3,89 PLN netto) ⚠️                                 | 5 albo 10 GB                                      | ✅ IMAP/SMTP                               | Cena z agregatorów, nie z oficjalnej strony                                                          | [capterra](https://www.capterra.com/p/174694/Zoho-Mail/pricing/) ⚠️                                                                                        |
| **Migadu Micro**                      | **$19/rok** (73,89 PLN) ✅                                                      | nieograniczone skrzynki i aliasy                  | ✅, ale **20 wychodzących/dzień**          | Firma szwajcarska, serwery w UE (❓ nie sprawdzone tu)                                               | [migadu.com/pricing](https://migadu.com/pricing/)                                                                                                          |
| **Proton Mail Plus**                  | $3,99/mies. rocznie (15,52 PLN) ✅                                              | 1 domena, 10 adresów ✅                           | ✅ przez Bridge/SMTP (płatne)              | Darmowy plan bez własnej domeny ✅                                                                   | [proton.me/mail/pricing](https://proton.me/mail/pricing)                                                                                                   |
| **Fastmail Individual**               | 25 zł/mies. rocznie (300 zł/rok); 30 zł/mies. miesięcznie ✅                    | wiele adresów ✅                                  | ✅                                         | Plan Basic **bez** własnej domeny ✅. Netto/brutto ❓                                                | [fastmail.com/pricing](https://www.fastmail.com/pricing/)                                                                                                  |
| **Google Workspace Business Starter** | 31,50 PLN netto/mies. (38,75 brutto) elastyczny ✅; rocznie −16%                | 30 GB, aliasy ✅                                  | ✅                                         | Promo −50% przez 3 mies. dla nowych                                                                  | [workspace.google.com/intl/pl/pricing](https://workspace.google.com/intl/pl/pricing.html)                                                                  |
| **Microsoft 365 Business Basic**      | ❓ strona nie odpowiedziała (timeout)                                           | –                                                 | ✅                                         | Do uzupełnienia                                                                                      | –                                                                                                                                                          |
| Pakiety home.pl / nazwa.pl / OVH      | ❓ nie sprawdzone                                                               | –                                                 | –                                          | Zwykle wymuszają MX u rejestratora; konflikt z Email Routing                                         | –                                                                                                                                                          |

**Konflikty DNS (kluczowe):**

- Rekord MX domeny głównej należy do skrzynki (Email Routing). Resend dodaje własny MX **tylko na subdomenie Return-Path** (`send.auth.<domena>`), więc konfliktu nie ma ✅ ([Resend: add a domain](https://resend.com/docs/add-a-domain)).
- **Jeden rekord SPF na nazwę hosta.** SPF domeny głównej = Email Routing; SPF Resend leży na `send.auth.<domena>`. Każdy ma 1 include, daleko od limitu 10 lookupów ✅ ([Cloudflare DNS records](https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/)).
- Supabase zaleca osobną subdomenę dla maili auth, np. `auth.example.com` ✅ ([Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). Resend zaleca wysyłkę z subdomeny ✅.

**Rekomendacja:** pilotaż: Email Routing (0 zł). Docelowo, gdy ktoś musi odpowiadać z `kontakt@`: Zoho Mail Lite albo Migadu Micro (MX zmienia się wtedy z Cloudflare na nowego dostawcę; Resend tego nie odczuje).

### 2.3 Dostawcy SMTP

| Dostawca                            | Free                                              | Płatne progi                                               | Nadwyżka /1 000             | Limity                                      | Region / dane                                                                                         | Dedyk. IP                                | Retencja                       | Śledzenie linków              | Źródło                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | --------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resend**                          | 3 000/mies., **100/dzień**, 3 domeny ✅           | Pro $20 (50k) / $35 (100k); Scale od $90                   | $0,90 (Pro) ✅              | API 10 req/s/zespół, do podniesienia ✅     | Wysyłka us-east-1 / **eu-west-1** / sa-east-1 / ap-northeast-1. **Dane konta i logi zawsze w USA** ✅ | $30/mies., tylko Scale, > 3 000/dzień ✅ | 30 dni ✅                      | **Domyślnie wyłączone** ✅    | [pricing](https://resend.com/pricing), [regions](https://resend.com/docs/dashboard/domains/regions), [tracking](https://resend.com/docs/dashboard/domains/tracking), [rate limit](https://resend.com/docs/api-reference/rate-limit) |
| **Postmark**                        | 100/mies. (bez nadwyżek) ✅                       | Basic $15 / Pro $16,50 / Platform $18 (od 10k) ✅          | $1,80 / $1,30 / $1,20 ✅    | –                                           | **USA** (Chicago + AWS), brak planów UE ✅                                                            | od $50/mies., > 300k/mies. ✅            | 45 dni (7–365 jako dodatek) ✅ | **Domyślnie `None`** ✅       | [pricing](https://postmarkapp.com/pricing), [EU privacy](https://postmarkapp.com/eu-privacy), [links](https://postmarkapp.com/developer/user-guide/tracking-links)                                                                  |
| **Amazon SES**                      | kredyty Free Tier do $200 (6 mies.) ✅            | pay-as-you-go                                              | **$0,10** ✅                | sandbox na start (❓ proces nie sprawdzony) | wybór regionu, m.in. eu-central-1 (❓ nie sprawdzone tu)                                              | $24,95/IP/mies. ✅                       | –                              | brak domyślnego               | [ses/pricing](https://aws.amazon.com/ses/pricing/)                                                                                                                                                                                  |
| **Cloudflare Email Sending (beta)** | brak na Workers Free ✅                           | **Workers Paid**: 3 000/mies. w cenie ✅                   | $0,35 ✅                    | –                                           | ❓                                                                                                    | –                                        | –                              | –                             | [pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [SMTP](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)                                                                         |
| **Scaleway TEM**                    | 300/mies. ✅                                      | Scale €80 (100k) ✅                                        | €0,25 (Essential) ✅        | ❓                                          | Francja (❓ region nie podany na stronie cennika)                                                     | Scale ✅                                 | ❓                             | ❓                            | [scaleway pricing](https://www.scaleway.com/en/pricing/managed-services/)                                                                                                                                                           |
| **Brevo**                           | 300/dzień ⚠️                                      | od ok. $9/mies. ⚠️                                         | ❓                          | –                                           | Francja/UE ⚠️                                                                                         | –                                        | –                              | śledzenie włączone na Free ⚠️ | [brevo free SMTP](https://www.brevo.com/free-smtp-server/) ⚠️ (oficjalny cennik nie dał się pobrać)                                                                                                                                 |
| **Mailgun**                         | 100/dzień ✅                                      | Basic $15 (10k), Foundation $35 (50k), Scale $90 (100k) ✅ | od $1,80 / $1,30 / $1,10 ✅ | –                                           | US albo EU ✅                                                                                         | $59/IP ✅                                | 1 / 1 / 5 / 30 dni ✅          | ❓                            | [mailgun pricing](https://www.mailgun.com/pricing/)                                                                                                                                                                                 |
| **MailerSend**                      | 500/mies. ✅                                      | Hobby $7 (5k), Starter €25 (50k) ✅                        | $1,50 / $0,90 ✅            | 100 zapytań API/dzień na Free ✅            | ❓ (firma litewska)                                                                                   | Enterprise ✅                            | 1 / 1 / 7 dni ✅               | ❓                            | [mailersend pricing](https://www.mailersend.com/pricing)                                                                                                                                                                            |
| **SendGrid**                        | darmowy plan wycofany 2025-05-27; trial 60 dni ⚠️ | Essentials $19,95 (50k) ⚠️                                 | –                           | –                                           | –                                                                                                     | Pro od $89,95 ⚠️                         | 3 dni ⚠️                       | ❓                            | [dreamlit](https://dreamlit.ai/blog/best-sendgrid-alternatives) ⚠️                                                                                                                                                                  |
| **Mailjet**                         | 6 000/mies., 200/dzień, logo Mailjet ✅           | Essential $19 (15k) ✅                                     | –                           | –                                           | ❓                                                                                                    | –                                        | –                              | ❓                            | [mailjet pricing](https://www.mailjet.com/pricing/)                                                                                                                                                                                 |

**Ustawienia SMTP (do Supabase):**

| Dostawca   | Host                                     | Port                                                                              | Użytkownik           | Hasło                                                 | Na liście Supabase |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------- | ------------------ |
| **Resend** | `smtp.resend.com`                        | **465** (SMTPS; to zaleca Resend dla Supabase), też 2465; STARTTLS 587/2587/25 ✅ | `resend`             | klucz API (`re_…`, zakres „Sending access" do domeny) | ✅                 |
| Postmark   | `smtp.postmarkapp.com`                   | 587 (STARTTLS), 2525, 25 ✅                                                       | Server API Token     | ten sam token ✅                                      | ✅                 |
| Cloudflare | `smtp.mx.cloudflare.net`                 | 465 (tylko implicit TLS) ⚠️                                                       | `api_token`          | token API „Email Sending: Edit"                       | ❌                 |
| SES        | `email-smtp.<region>.amazonaws.com` (❓) | 587/465                                                                           | SMTP credentials IAM | –                                                     | ✅                 |

Supabase wymienia: Resend, AWS SES, Postmark, SendGrid, ZeptoMail, Brevo ✅ ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)). Resend ma osobny przewodnik dla Supabase ✅ ([resend.com/docs/send-with-supabase-smtp](https://resend.com/docs/send-with-supabase-smtp)).

**Śledzenie linków (psuje tokeny):** Resend: wyłączone domyślnie, przełącznik w Domains → (domena) → Configuration albo `PATCH /domains/{id}` z `click_tracking:false, open_tracking:false` ✅. Postmark: `TrackLinks=None` domyślnie; nagłówek `X-PM-TrackLinks: None` ✅, ale **Supabase SMTP nie pozwala dodać własnych nagłówków** (w OpenAPI nie ma takiego pola ✅), więc ustawia się to na poziomie serwera. Postmark przed akceptacją konta i tak blokuje śledzenie linków ✅. Supabase sam ostrzega, że śledzenie przepisuje linki i je psuje ✅ ([email templates](https://supabase.com/docs/guides/auth/auth-email-templates)).

**Weryfikacja konta:** Resend: brak ręcznej akceptacji (❓ brak oficjalnej informacji o procedurze; w praktyce działa od razu po weryfikacji domeny). Postmark: **ręczna akceptacja każdego konta, < 24 h w dni robocze**. Do tego czasu wysyłka tylko na zweryfikowane domeny ✅ ([Postmark 1084](https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work)).

**Polscy dostawcy poczty (wp.pl/o2.pl, interia, onet):** nie znalazłem żadnych aktualnych, wiarygodnych raportów o Resend albo Postmark. Źródła są ogólne lub stare: WP i o2 to jedna platforma, Onet ocenia reputację i historię nadawcy, więc nowe domeny bywają w spamie; zgłoszenie spamu w Interii kieruje kolejne maile od nadawcy do spamu ⚠️ ([anomail](https://anomail.pl/ocena-email-dostawcy-poczty/), [webinsider: test SES](https://webinsider.pl/amazon-ses-test-smtp-saas/), [validity](https://www.validity.com/?p=13388)). Nie znalazłem oficjalnych stron postmaster WP/Onet/Interii z wymaganiami ❓. **Wniosek:** dostarczalność do tych skrzynek trzeba zmierzyć w teście E2E (§4.4), nie da się jej wyczytać z literatury.

**Rekomendacja: Resend.**

| Kryterium                 | Resend                                                           | Postmark                                     |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| Koszt pilotażu            | **$0** (Free) / $20                                              | $15 (Free 100/mies. za mały)                 |
| Start                     | od razu po DNS                                                   | do 24 h ręcznej akceptacji                   |
| Region wysyłki UE         | ✅ Irlandia (dane w USA)                                         | ❌ USA                                       |
| DPA                       | wbudowane w ToS, SCC + **DPF** ✅                                | wbudowane w ToS, SCC ✅ (DPF nie wspomniane) |
| Reputacja dostarczalności | dobra (AWS SES pod spodem: subprocesor „Hosting and sending") ⚠️ | najlepsza w branży (opinia rynkowa ⚠️)       |
| Prostota z Supabase       | oficjalny przewodnik, user `resend`                              | token jako user i hasło                      |

Postmark warto mieć jako **zapasowy SMTP** (Supabase zaleca „backup SMTP service on standby" ✅): konto założone i zaakceptowane, jedna zmiana PATCH. Cloudflare Email Sending warto rozważyć ponownie po wyjściu z bety, bo Workers Paid i tak jest wymagany przed crisis mode (CLAUDE.md), a 3 000 maili jest wtedy w cenie.

### 2.4 TCO (USD netto/mies.; PLN po kursie 3,8889)

Wolumen: ~3 maile na użytkownika w pierwszym miesiącu (potwierdzenie, ponowne wysłanie, reset). Później znacznie mniej. To górna granica.

| Scenariusz     | Maile/mies. | Resend                                            | Postmark                                                | SES   | Cloudflare (przy Workers Paid) | Scaleway TEM |
| -------------- | ----------- | ------------------------------------------------- | ------------------------------------------------------- | ----- | ------------------------------ | ------------ |
| Pilotaż 50–500 | 150–1 500   | **$0** (Free, ale ≤ 100/dzień) albo **$20** (Pro) | $15                                                     | $0,15 | $0                             | €0–0,30      |
| 1 000          | 3 000       | $20 (Free na styk z 3 000 i 100/dzień → Pro)      | $15                                                     | $0,30 | $0                             | €0,68        |
| 5 000          | 15 000      | **$20**                                           | $15 + 5 × 1,80 = $24                                    | $1,50 | 12 × 0,35 = $4,20              | €3,68        |
| 20 000         | 60 000      | $20 + 10 × 0,90 = $29                             | $15 + 50 × 1,80 = $105 (wyższy próg może być tańszy ❓) | $6,00 | 57 × 0,35 = $19,95             | €14,93       |

**Całość (domena .pl OVH + Resend + Email Routing):**

| Scenariusz                 | Miesięcznie netto | Rocznie netto (rok 1)       | Rocznie brutto (górna granica) |
| -------------------------- | ----------------- | --------------------------- | ------------------------------ |
| Pilotaż, Resend Free       | 0 PLN             | **16,69 PLN**               | 20,53 PLN                      |
| Pilotaż, Resend Pro        | 77,78 PLN         | **950,05 PLN**              | 1 168,56 PLN                   |
| 5k, Resend Pro             | 77,78 PLN         | 950,05 PLN (rok 2+: 992,35) | 1 168,56 PLN                   |
| 20k, Resend Pro + nadwyżka | 112,78 PLN        | 1 370,05 PLN                | 1 685,16 PLN                   |

Opłata za domenę (16,69 PLN netto w roku 1) jest wliczona w kolumny roczne.

---

## 3. Harmonogram wdrożenia

| #   | Krok                                                                                                                                               | Kto                                             | Czas pracy            | Czas oczekiwania                           | Ścieżka krytyczna         | Równolegle z |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- | ------------------------------------------ | ------------------------- | ------------ |
| 0   | Decyzje: TLD + nazwa, osoba fizyczna/firma (§5)                                                                                                    | właściciel                                      | 15 min                | –                                          | ✅                        | –            |
| 1   | Rejestracja `.pl` w OVH (albo `.com` w Cloudflare)                                                                                                 | właściciel                                      | 15 min                | płatność, aktywacja: minuty–godziny ❓     | ✅                        | 6, 7         |
| 2   | Dodanie strefy w Cloudflare (Free), zmiana NS w OVH                                                                                                | właściciel                                      | 15 min                | delegacja NS: do 24 h (zwykle szybciej ⚠️) | ✅                        | 6, 7         |
| 3   | Konto Resend, domena `auth.<domena>`, region **eu-west-1**, rekordy DKIM/SPF/MX w Cloudflare (**DNS only**)                                        | właściciel                                      | 20 min                | weryfikacja zwykle ≤ 15 min, max 72 h ✅   | ✅                        | 4            |
| 4   | Email Routing: `dmarc@`, `kontakt@` → prywatna skrzynka; rekord DMARC `p=none` (≥ 48 h po SPF/DKIM wg Google ⚠️, ale `p=none` niczego nie blokuje) | właściciel                                      | 15 min                | minuty                                     | –                         | 3            |
| 5   | Klucz API Resend (Sending access, tylko ta domena), PATCH Supabase (SMTP + limit + szablon)                                                        | właściciel (PAT) / agent przygotowuje polecenie | 15 min                | natychmiast                                | ✅                        | –            |
| 6   | Kod: strona potwierdzenia z przyciskiem POST zamiast `verifyOtp` na GET (§4.3), aktualizacja `supabase/templates/confirmation.html`, `config.toml` | agent, PR                                       | 1–3 h                 | CI + review                                | ✅ (przed testem E2E)     | 1–4          |
| 7   | Konta testowe: Gmail, Outlook, wp.pl, o2.pl, interia.pl, onet.pl, iCloud, Proton                                                                   | właściciel                                      | 30–60 min             | –                                          | –                         | 1–4          |
| 8   | Test E2E na produkcji (§4.4) z `wrangler tail`                                                                                                     | właściciel + agent                              | 1–2 h                 | –                                          | ✅                        | –            |
| 9   | Przejście na Resend Pro przed ogłoszeniem pilotażu                                                                                                 | właściciel                                      | 5 min                 | –                                          | –                         | –            |
| 10  | DMARC `quarantine` (+2–4 tyg.), potem `reject` (+2–4 tyg.)                                                                                         | właściciel                                      | 5 min za każdym razem | tygodnie                                   | ❌ (nie blokuje pilotażu) | –            |
| 11  | Dokumentacja: `infrastructure.md`, zamknięcie open items w `deployment-plan.md`                                                                    | agent                                           | 30 min                | –                                          | –                         | 10           |

**Ścieżka krytyczna:** 0 → 1 → 2 → 3 → 5 → 8, z 6 zmergowanym przed 8. Realnie **1 dzień roboczy**, najgorzej 3–4 dni (delegacja NS + 72 h weryfikacji). Krok 10 trwa tygodniami, ale nie blokuje pilotażu.

---

## 4. Gotowe artefakty

### 4.1 Rekordy DNS (Cloudflare, domena `skillnet.org.pl`)

Wartości DKIM i MX **zawsze kopiuj z zakładki Records w Resend**; poniższe nazwy i wartości to typowy układ dla regionu eu-west-1 ⚠️.

| Typ | Nazwa                    | Wartość                                                                     | Proxy | Cel                                            |
| --- | ------------------------ | --------------------------------------------------------------------------- | ----- | ---------------------------------------------- |
| TXT | `resend._domainkey.auth` | `p=MIGfMA0G…` (klucz z panelu Resend)                                       | –     | DKIM Resend                                    |
| MX  | `send.auth`              | `feedback-smtp.eu-west-1.amazonses.com`, priorytet 10 ⚠️                    | –     | Return-Path / bounce                           |
| TXT | `send.auth`              | `v=spf1 include:amazonses.com ~all` ⚠️                                      | –     | SPF Return-Path                                |
| MX  | `@`                      | `route1/2/3.mx.cloudflare.net` (dodaje Email Routing) ✅                    | –     | odbiór `kontakt@`, `dmarc@`                    |
| TXT | `@`                      | `v=spf1 include:_spf.mx.cloudflare.net ~all` ✅                             | –     | SPF domeny głównej (jedyny rekord SPF na `@`!) |
| TXT | `cf2024-1._domainkey`    | (dodaje Email Routing) ✅                                                   | –     | DKIM forwardu                                  |
| TXT | `_dmarc`                 | `v=DMARC1; p=none; rua=mailto:dmarc@skillnet.org.pl; adkim=r; aspf=r; fo=1` | –     | DMARC (obejmuje też `auth.`)                   |

Etapy DMARC: `p=none` (od dnia 1) → `p=quarantine` (po 2–4 tyg., gdy raporty `rua` pokazują wyłącznie pass dla Resend i Cloudflare) → `p=reject` (po kolejnych 2–4 tyg.) ✅ (kolejność wg [Resend DMARC](https://resend.com/docs/dashboard/domains/dmarc) i [Google](https://knowledge.workspace.google.com/admin/security/recommended-dmarc-rollout?hl=pl)). Zgodność: `adkim=r`, `aspf=r`. DKIM podpisuje `d=auth.skillnet.org.pl` (zgodne z From `no-reply@auth.skillnet.org.pl`), a SPF `send.auth.skillnet.org.pl` jest zgodny w trybie relaxed.

**Najczęstsze błędy:** proxy Cloudflare (pomarańczowa chmurka) na CNAME blokuje weryfikację ✅; drugi rekord SPF na `@` zamiast scalenia ✅; w panelach OVH/home.pl/nazwa.pl dopisywanie domeny do nazwy hosta (`send.auth.skillnet.org.pl.skillnet.org.pl`) oraz cudzysłowy lub spacje wklejone w środek klucza DKIM ⚠️ (wiedza praktyczna, bez oficjalnego źródła).

**Narzędzia:**

```bash
dig +short TXT resend._domainkey.auth.skillnet.org.pl
```

```bash
dig +short MX send.auth.skillnet.org.pl
```

```bash
dig +short TXT _dmarc.skillnet.org.pl
```

Dalej: [dns.email](https://dns.email) (polecany przez Resend), MXToolbox (SPF/DMARC lookup), Google Admin Toolbox → CheckMX, mail-tester.com (wyślij potwierdzenie na adres testowy; cel ≥ 9/10), Google Postmaster Tools (dodaj `skillnet.org.pl` przez TXT; dashboard zgodności działa tylko dla domeny głównej ⚠️ i przy małym wolumenie bywa pusty ⚠️), dmarcian albo darmowy parser raportów `rua`. Microsoft SNDS **nie ma sensu** na współdzielonych IP Resend ⚠️.

**Wymogi Gmail/Yahoo/Microsoft:** przy < 5 000 maili/dzień obowiązuje SPF **lub** DKIM, PTR, TLS i spam < 0,3% ✅ ([Google 81126](https://support.google.com/a/answer/81126)). Bulk (≥ 5 000/dzień): SPF **i** DKIM, DMARC (`p=none` wystarczy), zgodność From, one-click unsubscribe **tylko dla marketingu/subskrypcji** ✅. Microsoft od 2025 roku odrzuca niezgodne maile od nadawców ≥ 5 000/dzień kodem `550 5.7.515` ✅ ([Microsoft TechCommunity](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)). Yahoo: analogicznie, bez sztywnego progu ⚠️. SkillNet jest daleko poniżej progów, ale pełne SPF + DKIM + DMARC i tak spełnia wszystko.

**Rozgrzewanie:** przy 100–1 500 maili/mies. na współdzielonych IP Resend rozgrzewanie IP nie jest potrzebne. Reputację **domeny** buduje się sama: pierwsze dni wyślij do zespołu i kont testowych, poproś testerów o „To nie spam" w wp/onet/interii, nie wysyłaj nic poza transakcyjnymi z `auth.`, utrzymuj niski bounce (walidacja adresu w formularzu już jest).

### 4.2 Polecenie PATCH (Supabase Management API)

Pola i typy sprawdzone w OpenAPI `https://api.supabase.com/api/v1-json` (schemat `UpdateAuthConfigBody`) ✅: `smtp_port` to **string**, `rate_limit_email_sent` i `smtp_max_frequency` to integery, `mailer_otp_exp` to integer. **Nie ma** pól na Reply-To, własne nagłówki ani wersję tekstową maila ✅.

```bash
export SUPABASE_PROJECT_REF="<ref>"   # npx supabase projects list
export SUPABASE_ACCESS_TOKEN="<PAT>"  # wpisz w terminalu, nie zapisuj w repo
export RESEND_SMTP_KEY="<re_...>"     # klucz "Sending access" tylko dla auth.<domena>
```

```bash
jq -n \
  --rawfile confirmation supabase/templates/confirmation.html \
  --arg pass "$RESEND_SMTP_KEY" \
  '{
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: $pass,
    smtp_admin_email: "no-reply@auth.skillnet.org.pl",
    smtp_sender_name: "SkillNet",
    rate_limit_email_sent: 100,
    mailer_subjects_confirmation: "Potwierdź adres e-mail w SkillNet",
    mailer_templates_confirmation_content: $confirmation
  }' \
| curl -sS -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @- \
| jq '{smtp_host, smtp_port, smtp_admin_email, rate_limit_email_sent, mailer_subjects_confirmation, mailer_otp_exp, mailer_autoconfirm, site_url}'
```

Przed PATCH zrób kopię obecnej konfiguracji na potrzeby rollbacku (bez sekretów):

```bash
curl -sS "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq 'del(.smtp_pass)' > "$TMPDIR/auth-config-before.json"
```

**Limity Supabase** ✅ ([rate limits](https://supabase.com/docs/guides/auth/rate-limits), [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)):

| Limit                                             | Wartość                                                                                      | Pole                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Wbudowany SMTP                                    | **2/h**, tylko adresy członków zespołu organizacji (`Email address not authorized`), bez SLA | –                                                           |
| Po włączeniu custom SMTP                          | **30/h** domyślnie                                                                           | `rate_limit_email_sent` (proponuję 100 na Free, 300 na Pro) |
| Rejestracja/logowanie/`/resend`/`/recover` per IP | 30 / 5 min                                                                                   | (dashboard)                                                 |
| `/verify` per IP                                  | 30 / 5 min                                                                                   | `rate_limit_verify`                                         |
| Odstęp między mailami do tego samego użytkownika  | 60 s                                                                                         | `smtp_max_frequency` (zostaw 60)                            |
| Ważność linku i OTP                               | 3600 s domyślnie; > 86 400 odradzane                                                         | `mailer_otp_exp` (zostaw 3600: szablon mówi „godzinę")      |

**Uwaga:** proponowany limit 100/h przy Resend Free (100/dzień) chroni przed zalaniem przez bota, ale nie przed dziennym limitem Resend. Dlatego przed ogłoszeniem pilotażu: Resend Pro i `rate_limit_email_sent: 300`.

Site URL i lista przekierowań są już ustawione na produkcji (`change.md`). Sprawdź tylko w odpowiedzi PATCH, że `site_url` = `https://skillnet.barwy.workers.dev` i `mailer_autoconfirm` = `false`.

### 4.3 Polski szablon potwierdzenia

**Zachowaj schemat linku z repo** (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`), a nie `{{ .ConfirmationURL }}`. Link prowadzi wtedy na domenę aplikacji, a nie Supabase.

**Zmiana w kodzie (zalecana w S-16):** dziś `GET /auth/confirm` od razu wywołuje `verifyOtp` (`src/pages/auth/confirm.ts`). Skanery (Outlook Safe Links, Mimecast, Proofpoint, czyli właśnie bramki urzędów i rad) pobierają link i zużywają jednorazowy token. Supabase wprost zaleca prowadzić link na własną stronę, która kończy operację dopiero po kliknięciu przycisku ✅ ([email templates → prefetching](https://supabase.com/docs/guides/auth/auth-email-templates), [troubleshooting](https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0.md), [discussion #41618](https://github.com/orgs/supabase/discussions/41618)). Propozycja: GET renderuje stronę „Potwierdź adres" z formularzem `POST /auth/confirm` (ukryte `token_hash` i `type`), a dopiero POST wywołuje `verifyOtp` → `/profil`.

Proponowana treść `supabase/templates/confirmation.html` (tabele i style inline, bez obrazków, kontrast AA, tekst linku widoczny jako fallback, bo Supabase wysyła **tylko HTML** ✅):

```html
<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Potwierdź adres e-mail w SkillNet</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <div style="display:none;max-height:0;overflow:hidden;">
      Jedno kliknięcie i Twoje konto w SkillNet jest aktywne.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="max-width:560px;background:#ffffff;border-radius:8px;"
          >
            <tr>
              <td
                style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#18181b;"
              >
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#18181b;">
                  Potwierdź swój adres e-mail
                </h1>
                <p style="margin:0 0 16px;">
                  Dziękujemy za założenie konta w SkillNet, lokalnym katalogu umiejętności do pomocy sąsiedzkiej i w
                  sytuacjach kryzysowych.
                </p>
                <p style="margin:0 0 24px;">Kliknij przycisk, aby potwierdzić adres e-mail i dokończyć profil.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:6px;background:#1d4ed8;">
                      <a
                        href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
                        style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;"
                      >
                        Potwierdzam adres e-mail
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;color:#3f3f46;">
                  Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:
                </p>
                <p style="margin:0 0 24px;font-size:14px;word-break:break-all;">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="color:#1d4ed8;"
                    >{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email</a
                  >
                </p>
                <p style="margin:0 0 16px;">
                  Link jest ważny przez <strong>godzinę</strong> i działa tylko raz. Jeśli wygaśnie, na stronie
                  logowania możesz poprosić o nowy.
                </p>
                <p style="margin:0;font-size:14px;color:#3f3f46;">
                  Jeśli konto nie zostało założone przez Ciebie, zignoruj tę wiadomość. Bez potwierdzenia konto nie
                  zostanie aktywowane.
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="padding:16px 28px;border-top:1px solid #e4e4e7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#52525b;"
              >
                Wiadomość wysłana automatycznie do {{ .Email }}. Nie odpowiadaj na nią. Kontakt: kontakt@skillnet.org.pl
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

**Temat:** `Potwierdź adres e-mail w SkillNet` (już jest w `config.toml`).

**Wersja tekstowa** (Supabase SMTP nie wysyła części `text/plain`; przyda się dopiero przy Send Email Hook):

```
Potwierdź swój adres e-mail w SkillNet

Kliknij link, aby potwierdzić adres i dokończyć profil:
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email

Link jest ważny przez godzinę i działa tylko raz.
Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.
```

**Reset hasła i magic link:** aplikacja nie ma dziś tych przepływów (brak `resetPasswordForEmail` i `signInWithOtp` w `src/`). Publiczny endpoint `/recover` mimo to wyśle angielski mail. Proponuję w tym samym PATCH-u krótkie polskie wersje (decyzja w §5):

- `mailer_subjects_recovery`: `Resetowanie hasła w SkillNet`. Treść: „Otrzymaliśmy prośbę o zresetowanie hasła. Jeśli to nie Ty, zignoruj tę wiadomość." + `{{ .ConfirmationURL }}`, dopóki nie powstanie trasa resetu.
- `mailer_subjects_magic_link`: `Twój link do logowania w SkillNet`, analogicznie.

### 4.4 Checklista E2E na produkcji

Przygotowanie: w drugim terminalu `npx wrangler tail skillnet --format json --status error`; dashboard Resend → Emails otwarty.

- [ ] Konta testowe: Gmail, Outlook.com/Hotmail, wp.pl, o2.pl, interia.pl, onet.pl, iCloud, Proton (żadne nie należy do zespołu Supabase).
- [ ] Rejestracja na każdym koncie → mail dociera w < 1 min; zapisz folder (Odebrane / Oferty / Spam) w tabeli.
- [ ] Nadawca `SkillNet <no-reply@auth.<domena>>`, polski temat, polska treść, przycisk widoczny w trybie ciemnym.
- [ ] „Pokaż oryginał" (Gmail) / „Wyświetl źródło" (Outlook, wp.pl): `spf=pass`, `dkim=pass header.d=auth.<domena>`, `dmarc=pass`.
- [ ] mail-tester.com: rejestracja z adresem z mail-tester → wynik ≥ 9/10.
- [ ] Link na desktopie i na telefonie (rejestracja na laptopie, potwierdzenie na telefonie) → `/profil`; w bazie jest wiersz zgody `signup`.
- [ ] Prefetch: konto Outlook.com, odczekaj 5 min przed kliknięciem → link nadal działa (po zmianie z §4.3).
- [ ] Ponowne wysłanie z `/auth/link-wygasl` → nowy mail; drugie wysłanie w < 60 s jest dławione bez ujawniania stanu konta.
- [ ] Wygasły link (stary mail po ponownym wysłaniu albo > 1 h) → `/auth/link-wygasl`.
- [ ] Istniejące konto zespołu → bramka `/zgoda`, akceptacja działa.
- [ ] Bounce: rejestracja na nieistniejący adres w swojej domenie → w Resend status `bounced`, adres trafia na listę wstrzymanych.
- [ ] Skarga: oznacz mail jako spam w jednej skrzynce testowej → zdarzenie `complained` w Resend (Gmail nie wysyła FBL per wiadomość ⚠️).
- [ ] `kontakt@` i `dmarc@` docierają do prywatnej skrzynki (Email Routing).
- [ ] `wrangler tail` bez błędów; brak danych osobowych w logach.
- [ ] Po 24–48 h: pierwszy raport DMARC `rua` z Google/Microsoft w `dmarc@`.
- [ ] Monitoring: Resend webhooki `email.bounced` i `email.complained` (opcjonalnie na później), Google Postmaster Tools dodany, cotygodniowy przegląd przez pierwszy miesiąc.

---

## 5. Supabase: pozostałe kwestie

- **Niepotwierdzone konta sprzed wdrożenia:** policz je SQL-em w Studio (`select count(*) from auth.users where email_confirmed_at is null and created_at < '<data wdrożenia>'`; samą liczbę, bez wypisywania adresów). Użytkownicy mogą sami poprosić o nowy link w `/auth/link-wygasl` (`/api/auth/resend` już istnieje). Jeśli kont jest kilka i znasz ich właścicieli, napisz do nich ręcznie. Konta niepotwierdzone przez 30 dni możesz usunąć (decyzja właściciela; usunięcie zostawia wiersze zgody zgodnie z regułami S-05 ❓, sprawdź przed czyszczeniem).
- **Rollback:** (a) SMTP Resend nie działa → jeden PATCH z danymi zapasowego dostawcy (decyzja §7: zapasowy dostawca odłożony, więc w S-16 zostaje wariant b); (b) awaryjnie wyłącz custom SMTP w Dashboardzie: wraca wbudowany SMTP, czyli rejestracja działa tylko dla zespołu, ale nic się nie psuje; (c) szablon zepsuty → PATCH z poprzednią treścią z `$TMPDIR/auth-config-before.json`. Żaden z tych kroków nie wymaga deployu Workera.
- **Bezpieczeństwo klucza:** klucz Resend z uprawnieniem „Sending access" ograniczonym do `auth.<domena>`; przechowywany tylko w Supabase i menedżerze haseł; rotacja = nowy klucz + PATCH `smtp_pass`.

---

## 6. Ryzyka i RODO (wiedza ogólna, nie porada prawna)

| Temat                   | Stan                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DPA (umowa powierzenia) | Resend: część ToS, wiąże z akceptacją ✅. Postmark: część ToS od 2021-09-27 ✅                                                                                                                   |
| Transfer poza EOG       | Resend: SCC (decyzja 2021/914) + certyfikacja **EU-US DPF** ✅; główne przetwarzanie w USA ✅; wszyscy subprocesorzy w USA ✅. Postmark: SCC ✅, DPF nie wspomniane na stronie ❓                |
| Region UE               | Resend eu-west-1 zmienia tylko miejsce wysyłki; logi i metadane są w USA ✅. Jeśli DPO rady będzie wymagał danych w UE: Scaleway TEM (Francja), Mailgun EU, Brevo/Mailjet (Francja ⚠️)           |
| Dane w mailu            | adres e-mail + token. Bez imienia, lokalizacji ani umiejętności, czyli minimalny zakres                                                                                                          |
| Retencja logów          | Resend 30 dni ✅; Postmark 45 dni (skracalne do 7) ✅; listy wstrzymanych adresów bezterminowo ✅                                                                                                |
| Polityka prywatności    | Dopisz w `/prywatnosc` odbiorcę danych (dostawca e-mail), transfer do USA i podstawę (DPF/SCC), cel: realizacja umowy, art. 6 ust. 1 lit. b RODO. Łączy się z otwartym przeglądem prawnym z S-05 |
| Mailing transakcyjny    | Nie wymaga zgody marketingowej ani linku wypisania (Google: unsubscribe tylko dla marketingu ✅)                                                                                                 |

---

## 7. Decyzje właściciela (2026-10-21)

| #   | Pytanie                            | Decyzja                                         | Konsekwencja dla planu                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TLD                                | **`.pl` w OVH** (domena funkcjonalna `.org.pl`) | DNS delegowany do Cloudflare (strefa Free)                                                                                                                                                                                                                                                                                                   |
| 2   | Nazwa                              | **`skillnet.org.pl`**                           | `skillnet.pl` jest zajęta (abonent: organizacja, rejestrator LH.pl, od 2026-05-15). `skillnet.org.pl` była wolna w WHOIS NASK 2026-10-21. OVH: **12,89 PLN netto / 15,85 brutto** w roku 1, **43,19 / 53,12** przy odnowieniu ✅ ([ovhcloud .org.pl](https://www.ovhcloud.com/pl/domains/tld/orgpl/)), czyli **122,09 PLN brutto za 3 lata** |
| 3   | Abonent                            | **Firma / organizacja**                         | Nazwa i adres abonenta będą publiczne w WHOIS. Potrzebne dane podmiotu przy rejestracji                                                                                                                                                                                                                                                      |
| 4   | Aplikacja na własnej domenie       | **Nie, osobny krok** (Phase 8)                  | Linki w mailach prowadzą na `skillnet.barwy.workers.dev`; Site URL i redirecty bez zmian                                                                                                                                                                                                                                                     |
| 5   | Resend Pro                         | **Przed ogłoszeniem pilotażu**                  | Konfiguracja i E2E na Free z `rate_limit_email_sent: 100`; przy przejściu na Pro podnieść do 300                                                                                                                                                                                                                                             |
| 6   | Zapasowy SMTP                      | **Później**                                     | Rollback w S-16 = powrót do wbudowanego SMTP (tylko zespół). Postmark do rozważenia przed crisis mode                                                                                                                                                                                                                                        |
| 7   | Szablony recovery i magic link     | **Tak, krótkie polskie** w tym samym PATCH-u    | Dodać `mailer_subjects_recovery`, `mailer_templates_recovery_content`, `mailer_subjects_magic_link`, `mailer_templates_magic_link_content` (pliki w `supabase/templates/` + `config.toml`)                                                                                                                                                   |
| 8   | `/auth/confirm` z przyciskiem POST | **W S-16**                                      | Zmiana kodu w `src/pages/auth/confirm.ts` + nowa strona potwierdzenia; test prefetchu w E2E                                                                                                                                                                                                                                                  |
| 9   | Dane w UE                          | **Do ustalenia** (właściciel zapyta)            | Na razie Resend (eu-west-1, logi w USA, DPF + SCC). Pytanie trafia do przeglądu prawnego `/prywatnosc`. Zmiana dostawcy później = nowe rekordy DNS + jeden PATCH                                                                                                                                                                             |

Zaktualizowany koszt (domena `.org.pl`): pilotaż na Resend Free ≈ **15,85 PLN brutto/rok**; z Resend Pro ≈ 933,36 PLN netto + 12,89 PLN = **946,25 PLN netto w roku 1** (≈ 1 163,88 PLN brutto, górna granica).

---

## 8. Źródła (dostęp 2026-10-21)

**Supabase**

1. https://supabase.com/docs/guides/auth/auth-smtp ✅
2. https://supabase.com/docs/guides/auth/rate-limits ✅
3. https://supabase.com/docs/guides/auth/auth-email-templates ✅
4. https://supabase.com/docs/guides/auth/auth-email-passwordless ✅
5. https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook ✅
6. https://api.supabase.com/api/v1-json (OpenAPI, schemat `UpdateAuthConfigBody`) ✅
7. https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0.md ✅
8. https://github.com/orgs/supabase/discussions/41618 ⚠️

**Dostawcy wysyłki** 9. https://resend.com/pricing ✅ 10. https://resend.com/docs/send-with-smtp ✅ 11. https://resend.com/docs/send-with-supabase-smtp ✅ 12. https://resend.com/docs/dashboard/domains/regions ✅ 13. https://resend.com/docs/dashboard/domains/tracking ✅ 14. https://resend.com/docs/add-a-domain ✅ 15. https://resend.com/docs/dashboard/domains/introduction ✅ 16. https://resend.com/docs/dashboard/domains/dmarc ✅ 17. https://resend.com/docs/api-reference/rate-limit ✅ 18. https://resend.com/legal/dpa ✅ 19. https://resend.com/legal/subprocessors ✅ 20. https://postmarkapp.com/pricing ✅ 21. https://postmarkapp.com/developer/user-guide/send-email-with-smtp ✅ 22. https://postmarkapp.com/developer/user-guide/tracking-links ✅ 23. https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work ✅ 24. https://postmarkapp.com/eu-privacy ✅ 25. https://aws.amazon.com/ses/pricing/ ✅ 26. https://developers.cloudflare.com/email-service/ ✅ 27. https://developers.cloudflare.com/email-service/platform/pricing/ ✅ 28. https://developers.cloudflare.com/email-service/api/send-emails/smtp/ ⚠️ (z wyników wyszukiwania) 29. https://www.mailgun.com/pricing/ ✅ 30. https://www.mailersend.com/pricing ✅ (rozbieżność w nadwyżce Starter: $0,90 na kartach a $1,30 w FAQ) 31. https://www.scaleway.com/en/pricing/managed-services/ ✅ 32. https://www.mailjet.com/pricing/ ✅ 33. https://www.brevo.com/free-smtp-server/ ⚠️ (oficjalny cennik niedostępny; blog Brevo podaje sprzecznie 200 albo 300/dzień) 34. https://dreamlit.ai/blog/best-sendgrid-alternatives ⚠️

**Domeny** 35. https://www.ovhcloud.com/pl/domains/tld/ i https://www.ovhcloud.com/pl/domains/tld/pl/ ✅ 36. https://cfdomainpricing.com/ ⚠️ (serwis niezależny, deklaruje aktualizację 2026-10-21) 37. https://www.cloudflare.com/tld-policies/ ✅ 38. https://porkbun.com/products/domains ✅ 39. https://home.pl/domeny/ ✅ (bez odnowień) 40. https://www.nazwa.pl/cennik/cennik-domen/ ✅ (bez odnowień) 41. https://www.inwx.com/en/domain/pricelist ✅ 42. https://www.dns.pl/en/whois/FAQ ✅ 43. https://community.cloudflare.com/t/does-cloudflare-charge-vat-for-eu-non-business-costumers/214099 ⚠️

**Skrzynki** 44. https://developers.cloudflare.com/email-routing/limits/ ✅ 45. https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/ ✅ 46. https://improvmx.com/pricing ✅ 47. https://www.zoho.com/mail/zohomail-pricing.html ✅ (cena Lite nieczytelna) · https://www.capterra.com/p/174694/Zoho-Mail/pricing/ ⚠️ 48. https://migadu.com/pricing/ ✅ 49. https://proton.me/mail/pricing ✅ 50. https://www.fastmail.com/pricing/ ✅ 51. https://workspace.google.com/intl/pl/pricing.html ✅

**Wymogi skrzynek i dostarczalność** 52. https://support.google.com/a/answer/81126 ✅ 53. https://knowledge.workspace.google.com/admin/security/recommended-dmarc-rollout?hl=pl ✅ 54. https://support.google.com/mail/answer/14668346 ✅ 55. https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 ✅ 56. https://resend.com/guides/email/deliverability/avoid-yahoo-spam-folder ⚠️ (adaptacja wymagań Yahoo) 57. https://anomail.pl/ocena-email-dostawcy-poczty/ ⚠️ 58. https://webinsider.pl/amazon-ses-test-smtp-saas/ ⚠️ (stary) 59. https://www.validity.com/?p=13388 ⚠️ 60. https://www.suped.com/learn/email-deliverability/does-microsoft-snds-monitor-reputation-for-office-365-hosted-domains ⚠️ 61. https://api.nbp.pl (kurs USD/EUR, 2026-10-21) ✅

**Niepewne lub sprzeczne:** odnowienia .pl w home.pl i nazwa.pl (niepublikowane); ceny Namecheap, Gandi, Squarespace i Microsoft 365 (nie pobrane); VAT w Cloudflare Registrar dla UE; dzienny limit Brevo Free (200 a 300); nadwyżka MailerSend Starter; cena Zoho Mail Lite; dokładne wartości DKIM i MX Resend (generowane w panelu); proces akceptacji nowych kont Resend (brak oficjalnego opisu); dostarczalność do wp.pl, o2.pl, onet.pl i interia.pl (brak aktualnych danych, do zmierzenia w E2E).

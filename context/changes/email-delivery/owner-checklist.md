# S-16: co robi właściciel

Rozpiska kroków po Twojej stronie, w kolejności. Szczegóły i uzasadnienia są w `plan.md` (fazy 1–4) i `research.md` (§4.1 rekordy DNS, §4.4 checklista E2E). Kod (faza 2) jest w PR z gałęzi `feat/email-delivery`.

## Stan (2026-10-24)

- Domena `skillnet.org.pl` zarejestrowana w OVH i aktywna (zamówienie 261431196, odnowienie co rok, ochrona przed transferem włączona).
- Strefa w Cloudflare **Active** (plan Free), serwery nazw `dora.ns.cloudflare.com` i `ethan.ns.cloudflare.com`, widoczne w rejestrze `.pl`.
- DNSSEC: włączony w Cloudflare, DS (klucz 2371, alg. 13) dodany w OVH i opublikowany przez rejestr. Walidacja przechodzi (flaga `ad` w 1.1.1.1, 8.8.8.8, 9.9.9.9).
- Email Routing włączony: MX `route1-3`, jeden SPF, DKIM `cf2024-1`. Reguły `kontakt@` i `dmarc@` → prywatny Gmail, catch-all wyłączony (Drop, Disabled).
- Test `kontakt@` przeszedł: mail z Onetu dotarł do prywatnego Gmaila (z opóźnieniem, Onet trzymał go w kolejce po wcześniejszym braku MX).

Sprawdzenie (dobry wynik: DS `2371 13 2 …`, MX `route1-3.mx.cloudflare.net`):

```bash
dig +norec DS skillnet.org.pl @b-dns.pl +short
```

```bash
dig +short MX skillnet.org.pl
```

**Następny krok:** konto Resend (punkt 0), potem punkt 1.7 (domena `auth.skillnet.org.pl` w Resend, eu-west-1) i zrzut zakładki Records.

## 0. Teraz, zanim domena będzie aktywna

- [x] Załóż konto Cloudflare (jeśli go nie masz).
- [ ] Załóż konto Resend (resend.com). Domeny jeszcze nie dodawaj.
- [ ] Utwórz PAT w Supabase (Account → Access Tokens) i zapisz go tylko w menedżerze haseł.
- [ ] Zapytaj IOD rady, czy dane maili muszą zostać w UE (Resend: wysyłka z eu-west-1, logi w USA).

## 1. Domena, DNS i Resend (faza 1)

Gdy domena pojawi się w OVH w **Web Cloud → Domeny**:

1. [x] Cloudflare → **Add a site** → `skillnet.org.pl`, plan **Free**. Zapisz dwa serwery nazw, które poda.
2. [x] OVH: najpierw **wyłącz DNSSEC**, potem w zakładce **Serwery DNS** wpisz serwery z Cloudflare. (Zrobione; rejestr `.pl` jeszcze przetwarza obie zmiany, zob. „Stan”.)
3. [x] Poczekaj, aż Cloudflare pokaże strefę jako **Active** (zwykle do kilku godzin, maks. 24 h).
4. [x] Cloudflare → DNS → **DNSSEC: Enable**, a rekord DS z Cloudflare wpisz w OVH. (23.10: DS 2371 dodany w OVH, w OVH „Trwa aktywacja”.)
5. [x] Cloudflare → **Email Routing**: włącz, potwierdź swoją prywatną skrzynkę jako adres docelowy, dodaj reguły `kontakt@` i `dmarc@` → prywatna skrzynka. Cloudflare sam doda MX `route1-3.mx.cloudflare.net`, SPF i DKIM `cf2024-1._domainkey`.
6. [x] Sprawdź, że na `@` jest **dokładnie jeden** rekord SPF: `v=spf1 include:_spf.mx.cloudflare.net ~all`.
7. [ ] Resend → Domains → **Add domain** → `auth.skillnet.org.pl`, region **eu-west-1 (Ireland)**.
8. [ ] Rekordy z zakładki **Records** w Resend przepisz do Cloudflare DNS, wszystkie jako **DNS only** (szara chmurka):
   - TXT `resend._domainkey.auth`: klucz DKIM (bez cudzysłowów i spacji w środku),
   - MX `send.auth`: host feedback Resend, priorytet 10,
   - TXT `send.auth`: `v=spf1 include:amazonses.com ~all`.
   - W Cloudflare wpisuj nazwę bez domeny (`send.auth`, nie `send.auth.skillnet.org.pl`).
9. [x] Dodaj TXT `_dmarc`: `v=DMARC1; p=none; rua=mailto:dmarc@skillnet.org.pl; adkim=r; aspf=r; fo=1`
10. [ ] Resend → **Verify**. Domena musi pokazać **Verified** (zwykle ≤ 15 min, maks. 72 h).
11. [ ] Resend → domena → **Configuration**: Click tracking i Open tracking **wyłączone** (przepisany link psuje token).
12. [ ] Resend → **API Keys** → nowy klucz, uprawnienie **Sending access**, domena tylko `auth.skillnet.org.pl`. Zapisz go tylko w menedżerze haseł.
13. [x] Wyślij test na `kontakt@skillnet.org.pl` i sprawdź, czy dochodzi do prywatnej skrzynki.
14. [ ] Dodaj `skillnet.org.pl` do Google Postmaster Tools (weryfikacja przez TXT).

Sprawdzenie (możesz wkleić mi wyniki):

```bash
dig +short TXT resend._domainkey.auth.skillnet.org.pl
```

```bash
dig +short MX send.auth.skillnet.org.pl
```

```bash
dig +short TXT _dmarc.skillnet.org.pl
```

## 2. Przegląd i merge PR z kodem (faza 2)

Zrobione przeze mnie: testy jednostkowe, lint, `astro check`, build, smoke lokalnie; prawdziwy token z lokalnego Supabase (dwa wejścia na link go nie zużywają, przycisk loguje i otwiera `/profil`, drugie użycie jest odrzucane); widok na telefonie i w trybie ciemnym.

Po Twojej stronie:

- [ ] Otwórz `supabase/templates/confirmation.html`, `magic_link.html` i `recovery.html` w przeglądarce i oceń treść oraz wygląd (zmienne `{{ .SiteURL }}` itd. będą widoczne jako tekst, to normalne).
- [ ] Sprawdź, że CI (`ci` i `smoke`) jest zielone, i zmerguj PR. Workers Builds wdroży go sam.
- [ ] Po wdrożeniu (smoke tylko do odczytu na produkcji):

```bash
SMOKE_READONLY=1 BASE_URL=https://skillnet.barwy.workers.dev npm run smoke
```

Nowa strona przyjmuje stare linki (`type=email`), więc merge przed fazą 3 niczego nie psuje.

## 3. Konfiguracja produkcji (faza 3)

Dopiero gdy faza 1 jest zweryfikowana, a PR z fazy 2 działa na produkcji. Robisz to sam, w swoim terminalu: sekrety nie trafiają do mnie ani do repo.

1. [ ] Ustal nazwę pola limitu „sign ups and sign ins”: w Supabase Dashboard → Authentication → Rate Limits zmień ten limit o 1 i zapisz. Potem uruchom podgląd (krok 3). Jeśli `rate_limit_otp` **nie** pokazuje zmienionej wartości, napisz mi, którą nazwę poprawić (`SIGNIN_LIMIT_FIELD` w `src/lib/auth-email-config.ts`).
2. [ ] Ustaw zmienne w terminalu (wartości wklej ręcznie, nie zapisuj w plikach):

```bash
export SUPABASE_PROJECT_REF="<ref z: npx supabase projects list>"
```

```bash
read -rs SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN
```

```bash
read -rs RESEND_SMTP_KEY && export RESEND_SMTP_KEY
```

3. [ ] Podgląd zmian (nic nie zmienia):

```bash
npm run auth:email-config -- --dry-run --set-smtp-pass
```

4. [ ] Jeśli podgląd jest w porządku, zastosuj. Skrypt poprosi o wpisanie `ref` projektu i zapisze kopię obecnej konfiguracji do `$TMPDIR` (do rollbacku):

```bash
npm run auth:email-config -- --set-smtp-pass
```

5. [ ] Drugi podgląd, bez `--set-smtp-pass`, musi pokazać „No changes”:

```bash
npm run auth:email-config -- --dry-run
```

6. [ ] W Dashboard sprawdź: SMTP Settings → Resend, nadawca `SkillNet <no-reply@auth.skillnet.org.pl>`; Rate Limits → 30 maili/h, 300 na 5 min dla weryfikacji i dla rejestracji/logowania.

Rollback: `npm run auth:email-config -- --restore <plik z $TMPDIR>` (najpierw z `--dry-run`).

## 4. Test na produkcji (faza 4)

- [ ] Konta testowe spoza zespołu: Gmail, Outlook.com, wp.pl, o2.pl, interia.pl, onet.pl, iCloud, Proton.
- [ ] Na każdym: rejestracja, czas dotarcia, folder (Odebrane / Oferty / Spam), w źródle maila `spf=pass`, `dkim=pass`, `dmarc=pass`. Zapisuj tylko nazwy dostawców, bez adresów.
- [ ] Outlook.com: odczekaj 5 min przed kliknięciem, link nadal działa.
- [ ] mail-tester.com: wynik co najmniej 9/10.
- [ ] Pięć rejestracji z rzędu z różnych urządzeń w ciągu 5 minut, bez błędu limitu.
- [ ] Poproś testerów, żeby w wp, onet i interii oznaczyli mail jako „To nie spam”.
- [ ] Po 24–48 h: pierwszy raport DMARC na `dmarc@`.

Wyniki wpiszemy razem do `e2e-results.md`, a ja uzupełnię dokumentację.

## Później (poza S-16)

- Resend Pro i `npm run auth:email-config -- --email-rate 300` przed ogłoszeniem pilotażu.
- DMARC `p=quarantine` po 2–4 tygodniach czystych raportów, potem `p=reject`.
- Zapasowy dostawca SMTP przed uruchomieniem trybu kryzysowego.

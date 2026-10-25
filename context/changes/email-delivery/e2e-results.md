# S-16: wyniki testu E2E na produkcji (faza 4)

Checklista: `research.md` §4.4 i `owner-checklist.md` sekcja 4. Zapisujemy tylko nazwy dostawców, bez adresów.

Konfiguracja w czasie testu: SMTP Resend (`auth.skillnet.org.pl`, eu-west-1), nadawca `SkillNet <no-reply@auth.skillnet.org.pl>`, „Confirm email” włączone (25.10).

## Wynik

S-16 uznane za działające 25.10 na podstawie dwóch testów: prawdziwej rejestracji na onet.pl i mail-tester.com 10/10. Pozostałych dostawców właściciel odłożył; dopisujemy ich tutaj, gdy się pojawią (np. przy pierwszych rejestracjach w pilotażu).

## Rejestracja (mail „Potwierdź adres e-mail w SkillNet”)

| Dostawca        | Data  | Czas dotarcia | Folder   | SPF  | DKIM | DMARC | Link działa     |
| --------------- | ----- | ------------- | -------- | ---- | ---- | ----- | --------------- |
| onet.pl         | 25.10 | „po chwili”   | Odebrane | —    | —    | —     | tak, zalogowało |
| mail-tester.com | 25.10 | < 1 min       | —        | pass | pass | pass  | — (nie klikany) |

Nagłówków `Authentication-Results` z Onetu nie zebraliśmy; wynik 10/10 w mail-testerze obejmuje SPF, DKIM i DMARC tej samej wysyłki.

## Odłożone

- Gmail (z „Pokaż oryginał”), Outlook.com (kliknięcie po 5 min: czy skanery nie zużywają linku), wp.pl, o2.pl, interia.pl, iCloud, Proton.
- Pięć rejestracji z różnych urządzeń w 5 min bez błędu limitu.
- Prośba do testerów o „To nie spam” w wp, onet, interii.
- Pierwszy raport DMARC na `dmarc@` (powinien przyjść 26–27.10).

Raport mail-tester: https://mail-tester.com/test-dummdmxhp (temat „Potwierdź adres e-mail w SkillNet”).

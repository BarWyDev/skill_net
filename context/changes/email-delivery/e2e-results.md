# S-16: wyniki testu E2E na produkcji (faza 4)

Checklista: `research.md` §4.4 i `owner-checklist.md` sekcja 4. Zapisujemy tylko nazwy dostawców, bez adresów.

Konfiguracja w czasie testu: SMTP Resend (`auth.skillnet.org.pl`, eu-west-1), nadawca `SkillNet <no-reply@auth.skillnet.org.pl>`, „Confirm email” włączone (25.10).

## Rejestracja (mail „Potwierdź adres e-mail w SkillNet”)

| Dostawca    | Data  | Czas dotarcia | Folder   | SPF | DKIM | DMARC | Link działa     |
| ----------- | ----- | ------------- | -------- | --- | ---- | ----- | --------------- |
| onet.pl     | 25.10 | „po chwili”   | Odebrane | ?   | ?    | ?     | tak, zalogowało |
| Gmail       |       |               |          |     |      |       |                 |
| Outlook.com |       |               |          |     |      |       |                 |
| wp.pl       |       |               |          |     |      |       |                 |
| o2.pl       |       |               |          |     |      |       |                 |
| interia.pl  |       |               |          |     |      |       |                 |
| iCloud      |       |               |          |     |      |       |                 |
| Proton      |       |               |          |     |      |       |                 |

## Pozostałe punkty

- [ ] Outlook.com: kliknięcie po 5 min, link nadal działa.
- [ ] mail-tester.com: wynik ≥ 9/10.
- [ ] Pięć rejestracji z różnych urządzeń w 5 min bez błędu limitu.
- [ ] Pierwszy raport DMARC na `dmarc@` (24–48 h).

# Polecenie: naprawa znalezisk z testów manualnych

Wklej poniższy tekst jako pierwszą wiadomość w nowej sesji (po `/clear`).

---

Napraw znaleziska z testów manualnych SkillNet. Źródło prawdy to `docs/qa/poprawki.md` (sekcja „Otwarte”, numery QA-NNN są stałe), kontekst scenariuszy jest w `docs/qa/plan-testow-manualnych.md`. Przestrzegaj CLAUDE.md, w tym zasad triage'u.

**Stan repo na start.** Gałąź `chore/close-s05-split-email-delivery` ma niezacommitowaną poprawkę QA-007 (zweryfikowaną w przeglądarce): `src/lib/postcode.ts`, `src/lib/postcode.test.ts` oraz zmiany w `DensityMap.tsx`, `LocationPicker.tsx`, `ProfileForm.tsx`, `validation/crisis.ts`, `validation/profile.ts` i `api/kody-pocztowe/index.ts`. Niezacommitowane są też `docs/qa/`, `.claude/skills/skillnet-qa/` i zmiana w `.gitignore` (`docs/qa/.konta.local`). Nie gub tych zmian. Zanim zaczniesz, zaproponuj, jak je rozdzielić na gałęzie lub commity (np. QA-007 i `docs/qa` osobno od nowych poprawek) i poczekaj na moją decyzję. Nie commituj ani nie pushuj bez mojej zgody.

**Krok 1, triage (bez kodu).** Przeczytaj wszystkie otwarte znaleziska (8 ważnych, 19 kosmetycznych, 0 blokujących) i sprawdź w kodzie każdą propozycję poprawki. Pokaż mi tabelę: QA-NNN, waga, proponowany wynik triage'u (fix / fix differently / skip / accept as risk / lesson / disagree), szacowany rozmiar (S/M/L), pliki, czy wymaga migracji. Pogrupuj poprawki w paczki, które da się zrobić i zweryfikować razem, np.:
- bezpieczeństwo i nagłówki: QA-028 (`src/middleware.ts`);
- walidacja „w Polsce”: QA-024 (migracja, trigger profilu i `create_crisis`, plus klient w `LocationPicker.tsx`); to zmiana bazy, więc expand-then-contract i test pgTAP;
- koordynator: QA-026 (miejsce kryzysu na liście, możliwa migracja), QA-025 (odmiana „osoby dopasowanych”, `src/lib/crisis-format.ts` z testem jednostkowym), QA-023, QA-027;
- dostępność na telefonie: QA-001 (cele dotykowe ≥ 44 px, lista miejsc jest w opisie znaleziska), QA-012;
- teksty i i18n: QA-003 (polska strona 404), QA-004, QA-013, QA-014, QA-021;
- UX profilu i formularzy: QA-017, QA-018, QA-019, QA-020, QA-022 i pozostałe.
Poczekaj, aż zatwierdzę triage i kolejność paczek.

**Krok 2, poprawki paczka po paczce.** Dla każdej zatwierdzonej paczki:
- trzymaj się konwencji z CLAUDE.md: alias `@/`, `cn()`, teksty UI po polsku, bez `console.*` z danymi osobowymi, migracje w `supabase/migrations/` z RLS i politykami per operacja, `zod` do walidacji wejścia;
- dodaj lub zaktualizuj testy: `npm run test:unit` dla logiki w `src/lib/` (moduły testowane tylko z `import type` i importami względnymi), `npm run test:db` dla zmian w bazie;
- jeśli zmieniasz przekierowania lub komunikaty z `api/auth/*`, zaktualizuj `scripts/smoke.mjs`;
- uruchom `npm run lint`, `npx astro check`, testy jednostkowe i bazowe; przy zmianach widocznych w przeglądarce zweryfikuj je w podglądzie (`preview_start` z konfiguracją `astro-dev`), także na 375 px;
- po paczce zaktualizuj `docs/qa/poprawki.md`: przenieś naprawione znaleziska do sekcji „Naprawione” ze statusem `naprawione (<data>)`, z krótkim opisem poprawki i sposobem weryfikacji (format jak przy QA-007), przelicz tabelę „Podsumowanie”. Znaleziska z wynikiem skip / accept / disagree zostaw w „Otwartych” z dopisanym uzasadnieniem.

**Ograniczenia.**
- Nie dotykaj produkcji: żadnego `npx supabase db push`, `wrangler deploy` ani `wrangler secret put`. Migracja trafia na produkcję dopiero po merge'u PR, i to ręcznie przeze mnie.
- Nie zmieniaj kroków ani oczekiwanych wyników w `plan-testow-manualnych.md`. Rozbieżności (np. smoke read-only ma dziś 26 kroków, a nie dwa; K-10 nie ma „licznika ukrytych”) tylko zgłoś.
- Konta testowe w lokalnej bazie: `k1@skillnet.test` (koordynator) i `u01@skillnet.test`. Konto M1 zostało usunięte w sekcji F. Hasła są w `docs/qa/.konta.local`, nie czytaj ich i nie wypisuj; jeśli potrzebne jest logowanie, poproś mnie o wpisanie hasła w panelu przeglądarki.

**Na koniec.** Podsumuj, co naprawiono, co pominięto i dlaczego. Zaproponuj, które sekcje planu powtórzyć przez `/skillnet-qa`, żeby zweryfikować poprawki (np. `/skillnet-qa K-03..K-06 K-17`, `/skillnet-qa P` po wdrożeniu).

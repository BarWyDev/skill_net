# SkillNet / Sieć Sąsiedzka – Specyfikacja Produktowa

2026-09-21 · @Someone

## 1. Problem

W sytuacji kryzysowej (powódź, awaria infrastruktury, zagrożenie bezpieczeństwa) najcenniejszym zasobem lokalnym są ludzie z konkretnymi umiejętnościami mieszkający w pobliżu: medyk, elektryk, kierowca, rezerwista, osoba z kursem pierwszej pomocy, właściciel piły łańcuchowej lub agregatu. Dziś ta wiedza jest całkowicie rozproszona — ani samorząd, ani sąsiedzi nie wiedzą, kto co potrafi i gdzie mieszka.

Koordynacja zaczyna się od zera dopiero w momencie kryzysu: zakładanie grupy na Facebooku, dzwonienie po znajomych, chaotyczne posty w mediach społecznościowych. To kosztuje cenne godziny, a ludzie z umiejętnościami nie trafiają tam, gdzie są najbardziej potrzebni.

Drugi problem jest równie istotny: rozpad więzi społecznych w miastach. Ludzie nie znają sąsiadów, nie wiedzą do kogo zwrócić się po pomoc w codziennych sytuacjach. SkillNet adresuje oba te problemy jednocześnie — buduje gotowe struktury współpracy, zanim nadejdzie kryzys.

## 2. Rozwiązanie i propozycja wartości

Aplikacja, w której mieszkańcy dobrowolnie rejestrują swoje umiejętności (medyczne, techniczne, logistyczne, językowe, wojskowe) i przybliżoną lokalizację. System buduje żywą mapę "kto-co-gdzie" dla danej gminy lub osiedla.

### Elevator pitch (15 sekund)

Budujemy platformę, która mapuje umiejętności mieszkańców danej okolicy i automatycznie łączy ich w gotowe do działania grupy wzajemnej pomocy — zanim nadejdzie kryzys, nie w jego trakcie.

### Kluczowe wyróżniki

- Dual-use: ta sama baza działa na co dzień (wymiana sąsiedzka) i w kryzisie (koordynacja ratunkowa)
- Opt-in: wejście jest w pełni dobrowolne, użytkownik kontroluje widoczność swoich danych
- Odwrócony model: budujemy odporność proaktywnie, nie reaktywnie
- Lokalna skala: graf kompetencji ma sens na poziomie gminy/osiedla, nie całego kraju

### Wartość dla użytkownika

Mieszkaniec zyskuje dostęp do sieci sąsiedzkiej pomocy i konkretnych kompetencji w swoim otoczeniu. Samorząd dostaje gotową listę wolontariuszy z potrzebnymi umiejętnościami, posortowaną wg odległości od zdarzenia, zamiast zaczynać koordynację od zera.

## 3. Użytkownicy docelowi

| Persona | Opis | Motywacja |
| --- | --- | --- |
| Mieszkaniec-wolontariusz | Osoba z konkretnymi umiejętnościami (medyk, elektryk, ratownik, rezerwista, kierowca kat. C) | Chce pomagać sąsiadom, szuka poczucia wspólnoty |
| Nowy mieszkaniec | Osoba, która niedawno się przeprowadziła | Chce poznać sąsiadów i zintegrować się |
| Mieszkaniec szukający pomocy | Potrzebuje konkretnej usługi lub kompetencji w okolicy | Szybki dostęp do sąsiedzkiej pomocy bez pośredników |
| Koordynator samorządowy | Pracownik urzędu gminy, OPS, zarządzania kryzysowego | Potrzebuje gotowej bazy wolontariuszy i ich kompetencji |
| Służby mundurowe / obrona cywilna | Straż pożarna, policja, WOT, centra zarządzania kryzysowego | Szybki dostęp do cywilnych kompetencji w promieniu zdarzenia |
| Organizator szkoleń | Firma lub NGO prowadzące kursy (drony, pierwsza pomoc, przetrwanie) | Dociera do zmotywowanej grupy docelowej |

## 4. Tryby działania

### Tryb codzienny (domyślny)

Platforma wspólnotowa budująca kapitał społeczny: sąsiedzka wymiana umiejętności ("pomogę z hydrauliką, potrzebuję pomocy z ogródkiem"), integracja nowych mieszkańców, tablica ogłoszeń kompetencji, giełda drobnych usług sąsiedzkich. Użytkownik widzi ogólną mapę kompetencji w swojej okolicy bez danych osobowych konkretnych osób.

### Tryb kryzysowy (aktywowany przez samorząd/służby)

Aktywacja ręczna przez upoważniony podmiot (centrum zarządzania kryzysowego gminy, komendant OSP, WOT). Koordynator definiuje zdarzenie: typ kryzysu, lokalizację epicentrum, promień, potrzebne kompetencje. System natychmiast przeszukuje graf i generuje listę dopasowanych osób.

**Sekwencja kryzysowa (od zgłoszenia do zespołu w < 5 min):**

1. Koordynator aktywuje tryb kryzysowy: wybiera typ zdarzenia (powódź / awaria prądu / wypadek masowy / pożar / upały) + wskazuje lokalizację na mapie
2. System dopasowuje kompetencje do typu kryzysu (szczegóły mechanizmu poniżej) i sortuje wg odległości
3. Powiadomienie SMS/push do dopasowanych osób: "Kryzys \[typ\] w \[rejon\]. Twoje kompetencje \[X\] są potrzebne. Potwierdź dostępność: TAK / NIE"
4. Osoby potwierdzające dostępność trafiają na listę operacyjną koordynatora z danymi kontaktowymi i lokalizacją
5. Koordynator widzi na mapie w czasie rzeczywistym: kto jest dostępny, gdzie jest, jakie ma kompetencje
6. Opcjonalnie: system sugeruje podział na zespoły (np. 1 medyk + 1 elektryk + 1 kierowca = zespół ewakuacyjny)

### Mechanizm matchingu: trzy podejścia

Kluczowe pytanie architektoniczne: jak system decyduje, KTÓRE kompetencje są potrzebne w danym kryzysie i w jakiej kolejności?

#### Podejście A: Reguły statyczne (MVP, bez LLM)

Predefiniowana macierz typ kryzysu × potrzebne kompetencje. Koordynator wybiera typ zdarzenia z listy, system odpala zapytanie SQL po odpowiednich tagach kompetencji.

| Typ kryzysu | Kompetencje priorytetowe | Kompetencje wspomagające |
| --- | --- | --- |
| Powódź | Ratownik wodny, kierowca (łódź/samochód terenowy), osoba z pompą/agregatem | Elektryk, medyk, logistyk, osoba z piłą łańcuchową |
| Awaria prądu | Elektryk, osoba z agregatem prądotwórczym | Kierowca, logistyk, osoba z generatorem/UPS |
| Wypadek masowy | Ratownik medyczny, lekarz, pielęgniarka, osoba z kursem pierwszej pomocy | Kierowca, psycholog, tłumacz |
| Pożar | Strażak/OSP, kierowca | Medyk, osoba z narzędziami (piła, siekiera) |
| Upały/mróz | Medyk, opiekun osób starszych | Kierowca, wolontariusz z dostępem do klimatyzowanego/ogrzewanego lokalu |
| Cyberatak/blackout | Informatyk, elektryk, radioamator | Logistyk, osoba z generatorem, kierowca |

Zalety: prostota, przewidywalność, zero latencji, działa offline. Wady: sztywne, nie obsługuje scenariuszy mieszanych ani niestandardowych.

#### Podejście B: LLM jako warstwa interpretacji (faza 2+)

Koordynator opisuje sytuację tekstem swobodnym: "Drzewo spadło na linię energetyczną, jest ranny pieszy, droga zablokowana." LLM parsuje opis i wyciąga potrzebne kompetencje: elektryk (linia energetyczna) + medyk (ranny) + kierowca z piłą łańcuchową (drzewo na drodze). System odpala matching na tych kompetencjach.

Zalety: obsługuje nieoczekiwane scenariusze, koordynator nie musi myśleć o kategoriach — opisuje co widzi. Wady: latencja (2-5s na wywołanie LLM), zależność od API, koszt, ryzyko halucynacji w sytuacji kryzysowej, wymaga internetu.

#### Podejście C: Hybrid — rekomendowane

MVP startuje z regułami statycznymi (podejście A). Koordynator wybiera typ kryzysu → natychmiastowa lista. Równolegle dostępne jest pole tekstowe "opisz sytuację szczegółowo" — jeśli koordynator go użyje, LLM analizuje opis i SUGERUJE dodatkowe kompetencje (np. "Wykryto wzmiankę o osobie obcojęzycznej — dodać tłumacza?"). Koordynator zatwierdza lub odrzuca sugestie jednym kliknięciem.

Krytyczne: LLM nigdy nie podejmuje decyzji autonomicznie w trybie kryzysowym. Zawsze sugeruje, człowiek zatwierdza. Jeśli LLM jest niedostępny (brak internetu, awaria API), system działa w pełni na regułach statycznych — zero degradacji funkcjonalności krytycznej.

### Scoring i ranking dopasowań

Niezależnie od tego, które podejście generuje listę potrzebnych kompetencji, ranking osób opiera się na formule punktowej:

**Score = W\_odległość × (1/odległość\_km) + W\_kompetencja × dopasowanie\_kompetencji + W\_dostępność × potwierdzenie\_dostępności + W\_doświadczenie × poziom\_kompetencji**

Gdzie wagi (W) zależą od typu kryzysu: w wypadku masowym W\_kompetencja medyka jest najwyższe; w powodzi W\_odległość dominuje (bo dojazd może być niemożliwy). Te wagi to prosta konfiguracja, nie LLM.

Poziom kompetencji (opcjonalnie w przyszłości): samodeklaracja na skali 1-3 (podstawowy kurs / praktyk / profesjonalista), weryfikowalna certyfikatem.

### Predefiniowane szablony zespołów

System zna optymalne składy zespołów dla typowych scenariuszy:

- Zespół ewakuacyjny: 1 medyk + 1 osoba silna fizycznie + 1 kierowca z pojazdem
- Zespół techniczny: 1 elektryk + 1 osoba z narzędziami + 1 kierowca
- Zespół opiekuńczy (upały/mrozy): 1 medyk/opiekun + 1 kierowca + 1 wolontariusz z lokalem
- Punkt medyczny: 2 medyków/ratowników + 1 logistyk

Koordynator może poprosić system o "złóż mi 3 zespoły ewakuacyjne w promieniu 5 km" — system dobiera optymalne składy z dostępnych osób.

### Tryb obronny (perspektywa długoterminowa)

Naturalna baza do budowania lokalnej odporności cywilnej. Uzupełnienie systemu rezerw — oddolnie, bez przymusu. Identyfikacja luk kompetencyjnych w danym rejonie (np. brak ratowników medycznych w promieniu 5 km) jako sygnał do organizacji szkoleń. Integracja z WOT, OSP i innymi formacjami.

### Przejścia między trybami

Tryb codzienny działa zawsze. Tryb kryzysowy aktywuje się obok niego na czas zdarzenia — nie zastępuje, a rozszerza. Dezaktywacja po zakończeniu kryzysu wraca do trybu codziennego. Każdy tryb operuje na tych samych danych, ale z różnymi regułami widoczności i kontaktu.

## 5. MVP — minimalny zestaw funkcjonalności

Cel MVP: udowodnić, że matching kompetencja + lokalizacja → osoba działa i jest użyteczny. Horyzont: 48h pracy deweloperskiej na demo, 2-4 tygodnie na wersję testowalną z realnymi użytkownikami.

### Funkcjonalności wchodzące w MVP

| Funkcjonalność | Opis | Priorytet |
| --- | --- | --- |
| Formularz rejestracji | Imię/pseudonim, umiejętności (z predefiniowanej listy + pole "inne"), kod pocztowy lub pin na mapie, numer telefonu (ukryty domyślnie), dostępność (dni/godziny) | P0 |
| Katalog kompetencji | Predefiniowana taksonomia: medyczne, techniczne, logistyczne, językowe, wojskowe/rezerwa, narzędzia/sprzęt, inne | P0 |
| Algorytm matchingu | Zapytanie "potrzebuję \[kompetencja\] w promieniu \[X km\] od \[lokalizacja\]" → posortowana lista osób z tą kompetencją wg odległości | P0 |
| Mapa gęstości | Dashboard pokazujący zagęszczenie konkretnych umiejętności na mapie (heatmapa): "ilu ratowników w promieniu 2 km" bez ujawniania dokładnej lokalizacji | P0 |
| Demo scenariusza kryzysowego | Symulacja: awaria w konkretnej dzielnicy → system w kilka sekund zwraca listę 5 najbliższych osób z potrzebnymi kompetencjami | P1 |
| Baza pożądanych kompetencji | Lista kompetencji, które użytkownicy chcieliby nabyć (kurs dronowy, pierwsza pomoc, obsługa agregatu) — sygnał popytowy dla organizatorów szkoleń | P1 |
| Prosty system opt-in/opt-out | Użytkownik decyduje, które dane są widoczne i w jakim trybie; może się wyrejestrować w dowolnym momencie | P0 |

## 6. Co NIE wchodzi w zakres MVP

Świadome wykluczenia, które zostawiamy na późniejsze fazy:

| Funkcjonalność wykluczona | Dlaczego nie teraz |
| --- | --- |
| Integracja z mObywatel | Wymaga współpracy z KPRM i procesu certyfikacji; w MVP rejestracja przez prosty formularz z weryfikacją e-mail/SMS |
| Weryfikacja kompetencji (dyplomy, certyfikaty) | Zwiększa barierę wejścia i złożoność; w MVP opieramy się na zaufaniu i samodeklaracji |
| System płatności za usługi | Wprowadza regulacje finansowe i podatkowe; MVP to wymiana bezgotówkowa i wolontariat |
| Czat / komunikator wewnętrzny | Złożoność techniczna; w MVP kontakt przez telefon/SMS po ujawnieniu danych w trybie kryzysowym |
| Aplikacja natywna (iOS/Android) | Koszt i czas; MVP jako responsywna aplikacja webowa (PWA) |
| Wielojęzyczność | MVP po polsku; wersje językowe w kolejnych fazach |
| Panel administracyjny dla samorządu | W MVP koordynator korzysta z tego samego dashboardu co użytkownicy, z rozszerzonym widokiem |
| Integracja z systemami alarmowymi (RCB, IMGW) | Wymaga API i partnerstw instytucjonalnych; w MVP aktywacja ręczna |
| System reputacji / ocen | Zbyt wczesne; może zniechęcać do rejestracji |
| Automatyczne powiadomienia kryzysowe | W MVP powiadomienie = SMS/e-mail do zarejestrowanych; pełny system push w kolejnej fazie |

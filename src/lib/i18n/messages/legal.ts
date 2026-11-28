// The consent gate (/zgoda) and the privacy notice (/prywatnosc), roadmap S-19. Polish is the shape;
// `en` and `uk` are typed as it. Relative imports only, so `node:test` loads it.
//
// The Polish notice is the binding text and belongs to CURRENT_CONSENT_VERSION (src/lib/consent.ts):
// changing a word of `pl.privacy` needs a new consent version, and legal.test.ts pins its hash so
// that an edit cannot pass unnoticed. English and Ukrainian are courtesy translations, shown with
// the `courtesy` note. The consent sentence itself is in the `auth` catalogue (`consent.label`).
// The Ukrainian text waits for a native reader (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";

export const pl = {
  courtesy: {
    /** Shown above a translated legal text. Never shown in Polish. */
    note: "To tłumaczenie informacyjne. Wiążący jest tekst w języku polskim.",
    original: "Polski oryginał",
  },
  consent: {
    title: "Zgoda na przetwarzanie danych — SkillNet",
    heading: "Potrzebujemy Twojej zgody",
    intro:
      "Aby dalej korzystać z SkillNet, potwierdź zgodę na przetwarzanie danych. Bez niej nie uwzględniamy Cię w kryzysach ani na mapie. Możesz też wylogować się albo usunąć konto.",
    accept: "Akceptuję i przechodzę dalej",
    signOut: "Wyloguj się",
    required: "Zaznacz zgodę na przetwarzanie danych, aby przejść dalej.",
    failed: "Nie udało się zapisać zgody. Spróbuj ponownie.",
  },
  privacy: {
    title: "Prywatność — SkillNet",
    description:
      "Jakie dane zbiera SkillNet, po co, kto je widzi w trybie kryzysowym i jak je usunąć. Informacja o przetwarzaniu danych osobowych.",
    heading: "Informacja o przetwarzaniu danych",
    version: "Wersja z dnia {date}",
    draft: "Wersja robocza. Treść czeka na przegląd prawny przed uruchomieniem pilotażu.",
    controller: {
      heading: "Administrator danych",
      body: "Administratorem Twoich danych jest operator serwisu SkillNet. Pełne dane administratora i adres do kontaktu w sprawie danych osobowych uzupełnimy przed uruchomieniem pilotażu.",
    },
    data: {
      heading: "Jakie dane przetwarzamy",
      items: [
        "adres e-mail, którego używasz do logowania;",
        "przybliżoną lokalizację: punkt na mapie lub kod pocztowy zamieniamy na środek kwadratu 500 × 500 m i nie zapisujemy ani dokładnego punktu, ani kodu pocztowego. Zapisujemy też, kiedy ostatnio zmieniła się lokalizacja: kursy w okolicy działają 7 dni po zmianie;",
        "umiejętności, które wskażesz, wraz z ich poziomem;",
        "dni i godziny, w których możesz pomóc, oraz ewentualną przerwę w dostępności;",
        "numer telefonu, jeśli zdecydujesz się go podać (nie jest wymagany).",
        "kursy sąsiedzkie, jeśli z nich korzystasz: kursy, które prowadzisz (umiejętność, tytuł, opis, czas trwania, liczba miejsc i szczegóły spotkania), oraz kursy, na które się zapisujesz, z czasem zapisu i wypisania.",
      ],
    },
    purpose: {
      heading: "W jakim celu",
      items: [
        "koordynacja pomocy w sytuacjach kryzysowych: koordynator rady może uruchomić kryzys i zobaczyć listę osób z pasującymi umiejętnościami w okolicy;",
        "pomoc sąsiedzka na co dzień;",
        "publiczna mapa umiejętności, która pokazuje wyłącznie przedziały liczby osób w kwadratach 2 × 2 km, nigdy pojedyncze osoby;",
        "kursy sąsiedzkie: bezpłatne kursy, które mieszkańcy prowadzą dla sąsiadów z okolicy.",
      ],
      phone:
        "Twój numer telefonu widzisz tylko Ty. Koordynator może go zobaczyć wyłącznie w trakcie aktywnego kryzysu, po podaniu powodu; każde takie odsłonięcie jest zapisywane, a ich listę widzisz w zakładce „Mój profil”. Gdy na alert kryzysowy odpowiesz „TAK”, koordynator zobaczy Twój numer, aby się z Tobą skontaktować w tym kryzysie.",
      courses:
        "Kurs, który prowadzisz, widzą zalogowani mieszkańcy z Twojego kwadratu 2 × 2 km i ośmiu kwadratów wokół niego: umiejętność, tytuł, opis, czas trwania, liczbę wolnych miejsc i kwadrat na mapie. Nigdy nie widzą Twojego imienia, adresu e-mail, telefonu, dokładnej lokalizacji ani poziomu umiejętności. Kurs pokazujemy tylko w kwadracie, który jest widoczny na publicznej mapie, czyli tam, gdzie mieszka co najmniej 5 osób. Kurs pokazuje jednak, że w tym kwadracie ktoś ma daną umiejętność, nawet jeśli mapa dla jej kategorii tego kwadratu nie pokazuje. Szczegóły spotkania widzą tylko osoby zapisane na kurs. Ty widzisz, ile osób się zapisało, ale nie kto. Organizator nie wie, kim są osoby zapisane.",
    },
    optOut: {
      heading: "Co możesz wyłączyć",
      intro: "W zakładce „Mój profil” możesz w każdej chwili, niezależnie od siebie, wyłączyć:",
      items: [
        "wliczanie Ciebie do publicznej mapy umiejętności; zmiana działa od następnego dnia, bo mapa odświeża się raz na dobę;",
        "użycie wybranej umiejętności w kryzysach; taka umiejętność nie wpływa na dopasowanie ani kolejność, a koordynator jej nie widzi. Jeśli wyłączysz wszystkie, koordynator Cię nie znajdzie;",
        "pokazywanie koordynatorowi, kiedy możesz pomóc; zobaczy wtedy „nie podano”;",
        "awaryjne odsłonięcie numeru; koordynator zobaczy tylko, ile osób się na to nie zgodziło, a nie kto.",
      ],
      after:
        "Zmiany działają od razu, także w trwającym kryzysie (poza mapą). Adresu e-mail i dokładnej lokalizacji nie pokazujemy nikomu, więc nie ma czego wyłączać; w kryzysie koordynator widzi tylko odległość, zaokrągloną do 0,5 km. Poziom umiejętności jest widoczny razem z nią. Aby całkiem zniknąć z kryzysów na jakiś czas, wstrzymaj dostępność.",
    },
    recipients: {
      heading: "Komu przekazujemy dane",
      intro: "Korzystamy z usług firm, które przetwarzają dane w naszym imieniu:",
      items: [
        "Supabase — baza danych i logowanie; przechowuje wszystkie dane konta wymienione wyżej;",
        "Cloudflare — serwery, na których działa serwis; przy każdej wizycie przetwarza adres IP i treść zapytań;",
        "OpenStreetMap Foundation — podkłady map. Przeglądarka pobiera je bezpośrednio z serwerów OpenStreetMap, które widzą Twój adres IP i oglądany fragment mapy, na profilu: okolicę zapisanej lokalizacji.",
      ],
      after:
        "W trakcie kryzysu Twoje dane widzi też koordynator rady, w zakresie opisanym wyżej. Nie sprzedajemy danych i nie przekazujemy ich nikomu innemu.",
    },
    basis: {
      heading: "Podstawa prawna",
      body: "Twoja zgoda (art. 6 ust. 1 lit. a RODO), którą wyrażasz przy zakładaniu konta. Bez zgody nie możemy założyć konta, a osoby bez zgody nie są uwzględniane w kryzysach ani na mapie.",
    },
    retention: {
      heading: "Jak długo przechowujemy dane",
      body: "Do czasu usunięcia konta. Konto możesz usunąć w każdej chwili w zakładce „Mój profil”. Usunięcie jest natychmiastowe: kasujemy adres e-mail, lokalizację, umiejętności, dostępność, numer telefonu, prowadzone kursy i zapisy na kursy.",
      audit:
        "Zostają zapisy kontrolne. Zawierają identyfikator konta, ale nie e-mail ani dane profilu: kiedy wyrażono zgodę, kto prowadził kryzys i czyje numery odsłonił koordynator. Przy odsłonięciu zapisujemy też czas, kryzys z jego obszarem (okolicę kodu pocztowego) i powód podany przez koordynatora. Powód to tekst wpisany przez koordynatora, więc może zawierać dodatkowe informacje. Po usunięciu konta identyfikator nie wskazuje już nikogo w systemie. Okres przechowywania zapisów kontrolnych ustalimy przed uruchomieniem pilotażu.",
    },
    rights: {
      heading: "Twoje prawa",
      items: [
        "dostęp do swoich danych i ich poprawianie — w zakładce „Mój profil”, gdzie widzisz też, kiedy i w jakim kryzysie odsłonięto Twój numer;",
        "wycofanie zgody w dowolnym momencie przez usunięcie konta; wycofanie zgody nie wpływa na zgodność z prawem przetwarzania sprzed jej wycofania;",
        "usunięcie danych, ograniczenie przetwarzania i przeniesienie danych;",
        "skarga do Prezesa Urzędu Ochrony Danych Osobowych (uodo.gov.pl).",
      ],
    },
  },
};

export type LegalMessages = typeof pl;

export const en: LegalMessages = {
  courtesy: {
    note: "This is a courtesy translation. The binding text is the Polish original.",
    original: "Polish original",
  },
  consent: {
    title: "Consent to data processing — SkillNet",
    heading: "We need your consent",
    intro:
      "To keep using SkillNet, confirm your consent to data processing. Without it we do not include you in crises or on the map. You can also sign out or delete your account.",
    accept: "I accept and continue",
    signOut: "Sign out",
    required: "Tick the consent to data processing to continue.",
    failed: "Your consent could not be saved. Try again.",
  },
  privacy: {
    title: "Privacy — SkillNet",
    description:
      "What data SkillNet collects, what for, who sees it in crisis mode and how to delete it. Information on the processing of personal data.",
    heading: "Information on data processing",
    version: "Version of {date}",
    draft: "Draft. The text awaits a legal review before the pilot starts.",
    controller: {
      heading: "Data controller",
      body: "The controller of your data is the operator of the SkillNet service. We will add the controller’s full details and a contact address for personal data matters before the pilot starts.",
    },
    data: {
      heading: "What data we process",
      items: [
        "the email address you use to sign in;",
        "your approximate location: we turn a point on the map or a postcode into the centre of a 500 × 500 m square and store neither the exact point nor the postcode. We also store when the location last changed: courses nearby work 7 days after a change;",
        "the skills you indicate, with their level;",
        "the days and hours when you can help, and any pause in your availability;",
        "your phone number, if you choose to give it (it is not required).",
        "neighbourhood courses, if you use them: the courses you run (skill, title, description, duration, number of places and meeting details), and the courses you sign up for, with the time of signing up and withdrawing.",
      ],
    },
    purpose: {
      heading: "For what purpose",
      items: [
        "coordinating help in crisis situations: the council coordinator can activate a crisis and see a list of people nearby with matching skills;",
        "everyday neighbourly help;",
        "the public skills map, which shows only ranges of the number of people in 2 × 2 km squares, never individual people;",
        "neighbourhood courses: free courses that residents run for neighbours in their area.",
      ],
      phone:
        "Only you see your phone number. The coordinator can see it only during an active crisis, after giving a reason; every such reveal is recorded, and you see the list in the “My profile” tab. When you answer “TAK” (yes) to a crisis alert, the coordinator will see your number in order to contact you in that crisis.",
      courses:
        "A course you run is seen by signed-in residents of your 2 × 2 km square and the eight squares around it: the skill, title, description, duration, number of free places and the square on the map. They never see your name, email address, phone number, exact location or skill level. We show a course only in a square that is visible on the public map, that is, where at least 5 people live. A course does show, however, that someone in that square has the skill, even if the map for its category does not show that square. Only people signed up for the course see the meeting details. You see how many people signed up, but not who. The organiser does not know who the people signed up are.",
    },
    optOut: {
      heading: "What you can switch off",
      intro: "In the “My profile” tab you can at any time, independently of one another, switch off:",
      items: [
        "counting you in the public skills map; the change takes effect the next day, because the map refreshes once a day;",
        "the use of a chosen skill in crises; such a skill does not affect matching or order, and the coordinator does not see it. If you switch off all of them, the coordinator will not find you;",
        "showing the coordinator when you can help; they will then see “not given”;",
        "the emergency reveal of your number; the coordinator will see only how many people did not agree to it, not who.",
      ],
      after:
        "Changes take effect at once, also in an ongoing crisis (except for the map). We show your email address and exact location to nobody, so there is nothing to switch off; in a crisis the coordinator sees only the distance, rounded to 0.5 km. The skill level is visible together with the skill. To disappear from crises entirely for a while, pause your availability.",
    },
    recipients: {
      heading: "Who we pass data to",
      intro: "We use the services of companies that process data on our behalf:",
      items: [
        "Supabase — database and sign-in; it stores all the account data listed above;",
        "Cloudflare — the servers the service runs on; on every visit it processes the IP address and the content of requests;",
        "OpenStreetMap Foundation — map tiles. The browser fetches them directly from OpenStreetMap servers, which see your IP address and the part of the map you are viewing; on the profile, that is the area of your saved location.",
      ],
      after:
        "During a crisis your data is also seen by the council coordinator, to the extent described above. We do not sell data and do not pass it to anyone else.",
    },
    basis: {
      heading: "Legal basis",
      body: "Your consent (Article 6(1)(a) GDPR), which you give when creating an account. Without consent we cannot create an account, and people without consent are not included in crises or on the map.",
    },
    retention: {
      heading: "How long we keep data",
      body: "Until the account is deleted. You can delete your account at any time in the “My profile” tab. Deletion is immediate: we erase the email address, location, skills, availability, phone number, the courses you run and your course sign-ups.",
      audit:
        "Audit records remain. They contain the account identifier, but not the email or profile data: when consent was given, who ran a crisis and whose numbers the coordinator revealed. For a reveal we also record the time, the crisis with its area (the surroundings of a postcode) and the reason given by the coordinator. The reason is text typed by the coordinator, so it may contain additional information. Once the account is deleted, the identifier no longer points to anyone in the system. We will set the retention period for audit records before the pilot starts.",
    },
    rights: {
      heading: "Your rights",
      items: [
        "access to your data and correcting it — in the “My profile” tab, where you also see when and in which crisis your number was revealed;",
        "withdrawing consent at any time by deleting your account; withdrawing consent does not affect the lawfulness of processing before the withdrawal;",
        "erasure of data, restriction of processing and data portability;",
        "a complaint to the President of the Personal Data Protection Office (uodo.gov.pl).",
      ],
    },
  },
};

export const uk: LegalMessages = {
  courtesy: {
    note: "Це інформаційний переклад. Обов’язковим є текст польською мовою.",
    original: "Польський оригінал",
  },
  consent: {
    title: "Згода на обробку даних — SkillNet",
    heading: "Нам потрібна ваша згода",
    intro:
      "Щоб і далі користуватися SkillNet, підтвердьте згоду на обробку даних. Без неї ми не враховуємо вас у кризах і на мапі. Ви також можете вийти або видалити акаунт.",
    accept: "Приймаю і продовжую",
    signOut: "Вийти",
    required: "Позначте згоду на обробку даних, щоб продовжити.",
    failed: "Не вдалося зберегти згоду. Спробуйте ще раз.",
  },
  privacy: {
    title: "Приватність — SkillNet",
    description:
      "Які дані збирає SkillNet, навіщо, хто їх бачить у кризовому режимі та як їх видалити. Інформація про обробку персональних даних.",
    heading: "Інформація про обробку даних",
    version: "Версія від {date}",
    draft: "Робоча версія. Текст очікує юридичної перевірки перед початком пілотного проєкту.",
    controller: {
      heading: "Контролер даних",
      body: "Контролером ваших даних є оператор сервісу SkillNet. Повні дані контролера та адресу для звернень щодо персональних даних ми додамо перед початком пілотного проєкту.",
    },
    data: {
      heading: "Які дані ми обробляємо",
      items: [
        "електронну адресу, яку ви використовуєте для входу;",
        "приблизне місце розташування: точку на мапі або поштовий індекс ми замінюємо на центр квадрата 500 × 500 м і не зберігаємо ні точного місця, ні поштового індексу. Ми також зберігаємо, коли востаннє змінилося місце розташування: курси поблизу працюють через 7 днів після зміни;",
        "уміння, які ви вкажете, разом із їхнім рівнем;",
        "дні й години, коли ви можете допомогти, та можливу перерву в доступності;",
        "номер телефону, якщо ви вирішите його вказати (він не обов’язковий).",
        "сусідські курси, якщо ви ними користуєтеся: курси, які ви проводите (уміння, назва, опис, тривалість, кількість місць і деталі зустрічі), та курси, на які ви записуєтеся, з часом запису й виписування.",
      ],
    },
    purpose: {
      heading: "З якою метою",
      items: [
        "координація допомоги в кризових ситуаціях: координатор ради може оголосити кризу й побачити список людей поблизу з відповідними вміннями;",
        "повсякденна сусідська допомога;",
        "публічна мапа вмінь, яка показує лише діапазони кількості людей у квадратах 2 × 2 км і ніколи — окремих людей;",
        "сусідські курси: безплатні курси, які мешканці проводять для сусідів зі своєї околиці.",
      ],
      phone:
        "Ваш номер телефону бачите лише ви. Координатор може побачити його тільки під час активної кризи, вказавши причину; кожне таке відкриття записується, а їхній список ви бачите у вкладці «Мій профіль». Коли на кризове сповіщення ви відповісте «TAK» (так), координатор побачить ваш номер, щоб зв’язатися з вами в цій кризі.",
      courses:
        "Курс, який ви проводите, бачать зареєстровані мешканці вашого квадрата 2 × 2 км і восьми квадратів довкола нього: уміння, назву, опис, тривалість, кількість вільних місць і квадрат на мапі. Вони ніколи не бачать вашого імені, електронної адреси, телефону, точного місця розташування чи рівня вміння. Курс ми показуємо лише у квадраті, який видно на публічній мапі, тобто там, де мешкає щонайменше 5 людей. Проте курс показує, що в цьому квадраті хтось має це вміння, навіть якщо мапа для його категорії цього квадрата не показує. Деталі зустрічі бачать лише люди, записані на курс. Ви бачите, скільки людей записалося, але не хто. Організатор не знає, хто саме записався.",
    },
    optOut: {
      heading: "Що можна вимкнути",
      intro: "У вкладці «Мій профіль» ви можете будь-коли, незалежно одне від одного, вимкнути:",
      items: [
        "врахування вас на публічній мапі вмінь; зміна діє з наступного дня, бо мапа оновлюється раз на добу;",
        "використання вибраного вміння в кризах; таке вміння не впливає на добір і порядок, а координатор його не бачить. Якщо ви вимкнете всі, координатор вас не знайде;",
        "показ координаторові, коли ви можете допомогти; тоді він побачить «не вказано»;",
        "екстрене відкриття номера; координатор побачить лише, скільки людей на це не погодилося, а не хто.",
      ],
      after:
        "Зміни діють одразу, також у поточній кризі (крім мапи). Електронну адресу й точне місце розташування ми нікому не показуємо, тому вимикати нічого; у кризі координатор бачить лише відстань, округлену до 0,5 км. Рівень уміння видно разом із ним. Щоб на якийсь час повністю зникнути з криз, призупиніть доступність.",
    },
    recipients: {
      heading: "Кому ми передаємо дані",
      intro: "Ми користуємося послугами компаній, які обробляють дані від нашого імені:",
      items: [
        "Supabase — база даних і вхід; зберігає всі дані акаунта, перелічені вище;",
        "Cloudflare — сервери, на яких працює сервіс; під час кожного відвідування обробляє IP-адресу та зміст запитів;",
        "OpenStreetMap Foundation — картографічні підкладки. Браузер завантажує їх безпосередньо із серверів OpenStreetMap, які бачать вашу IP-адресу та фрагмент мапи, який ви переглядаєте; у профілі це околиця збереженого місця розташування.",
      ],
      after:
        "Під час кризи ваші дані бачить також координатор ради, в обсязі, описаному вище. Ми не продаємо дані й нікому іншому їх не передаємо.",
    },
    basis: {
      heading: "Правова підстава",
      body: "Ваша згода (ст. 6 ч. 1 літ. a GDPR), яку ви надаєте під час створення акаунта. Без згоди ми не можемо створити акаунт, а людей без згоди не враховуємо в кризах і на мапі.",
    },
    retention: {
      heading: "Як довго ми зберігаємо дані",
      body: "До видалення акаунта. Акаунт можна видалити будь-коли у вкладці «Мій профіль». Видалення відбувається негайно: ми стираємо електронну адресу, місце розташування, уміння, доступність, номер телефону, курси, які ви проводите, і записи на курси.",
      audit:
        "Залишаються контрольні записи. Вони містять ідентифікатор акаунта, але не електронну адресу чи дані профілю: коли надано згоду, хто вів кризу і чиї номери відкрив координатор. Під час відкриття ми також записуємо час, кризу з її територією (околицю поштового індексу) і причину, яку вказав координатор. Причина — це текст, який ввів координатор, тому вона може містити додаткову інформацію. Після видалення акаунта ідентифікатор уже ні на кого в системі не вказує. Термін зберігання контрольних записів ми визначимо перед початком пілотного проєкту.",
    },
    rights: {
      heading: "Ваші права",
      items: [
        "доступ до своїх даних і їх виправлення — у вкладці «Мій профіль», де ви також бачите, коли і в якій кризі відкрито ваш номер;",
        "відкликання згоди будь-коли через видалення акаунта; відкликання згоди не впливає на законність обробки до її відкликання;",
        "видалення даних, обмеження обробки та перенесення даних;",
        "скарга до Голови Управління з охорони персональних даних (uodo.gov.pl).",
      ],
    },
  },
};

export const legal: Record<Locale, LegalMessages> = { pl, en, uk };

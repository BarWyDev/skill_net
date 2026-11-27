// The resident's profile (roadmap S-19): the page, its form and islands, pausing, the list of number
// reveals, deleting the account, and every message the profile endpoints send back. Polish is the
// shape; `en` and `uk` are typed as it. Relative imports only, so `node:test` loads it.
//
// Phone numbers and postcodes stay Polish in every language: the service covers Poland only.
// The Ukrainian text waits for a native reader (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";
import { PHONE_ERROR } from "../../phone.ts";
import { OUTSIDE_POLAND_ERROR } from "../../poland.ts";
import { POSTCODE_ERROR } from "../../postcode.ts";
import { CRISIS_OFF_UNKNOWN_SKILL } from "../../visibility.ts";

export const pl = {
  page: {
    title: "Mój profil — SkillNet",
    heading: "Mój profil",
    loadFailed: "Nie udało się wczytać profilu. Odśwież stronę.",
    formLoading: "Ładowanie formularza…",
    pauseNeedsComplete:
      "Wstrzymać dostępność możesz, gdy profil jest kompletny: ma lokalizację i co najmniej jedną umiejętność.",
  },
  status: {
    pausedUntil: "Twoja dostępność jest wstrzymana do {date} włącznie.",
    pausedIndefinitely: "Twoja dostępność jest wstrzymana bezterminowo.",
    pausedEffect:
      "Nie pojawisz się w nowych kryzysach ani na mapie, a w trwających kryzysach koordynator Cię nie widzi.",
    resume: "Wznów dostępność",
    noCrisisSkills: "Żadna z Twoich umiejętności nie jest używana w kryzysach, więc koordynator Cię nie znajdzie.",
    noCrisisSkillsHint:
      "Zaznacz „Używaj w kryzysie” przy co najmniej jednej umiejętności, jeśli chcesz pomagać w kryzysach.",
    complete: "Profil kompletny",
    incompleteLead: "Profil niekompletny.",
    incompleteBody: "Dodaj lokalizację i co najmniej jedną umiejętność, aby koordynator mógł Cię znaleźć.",
    noPhone: "Bez numeru telefonu nie otrzymasz alertów kryzysowych.",
  },
  notices: {
    saved: "Zapisano.",
    paused: "Dostępność wstrzymana.",
    resumed: "Dostępność wznowiona.",
  },
  form: {
    skillsHeading: "Umiejętności i sprzęt",
    skillsHelp:
      "Zaznacz, co umiesz lub co masz. Przy umiejętnościach wybierz poziom. Odznacz „Używaj w kryzysie”, jeśli koordynator nie ma brać danej umiejętności pod uwagę.",
    locationHeading: "Przybliżona lokalizacja",
    locationHelp: "Wpisz kod pocztowy albo zaznacz miejsce na mapie.",
    phoneHeading: "Telefon",
    phoneHelp: "Opcjonalnie.",
    availabilityHeading: "Dostępność",
    availabilityHelp:
      "Zaznacz, kiedy zwykle możesz pomóc. To tylko informacja dla koordynatora — nikogo nie wyklucza z listy.",
    visibilityHeading: "Widoczność danych",
    visibilityHelp:
      "Zdecyduj, do czego wolno użyć Twoich danych. E-mail i dokładna lokalizacja nie są nikomu pokazywane.",
    showOnMapLabel: "Wliczaj mnie do publicznej mapy umiejętności",
    showOnMapHelp:
      "Mapa pokazuje tylko przedziały liczby osób w kwadratach 2 × 2 km. Zmiana działa od następnego dnia.",
    showAvailabilityLabel: "Pokazuj koordynatorowi, kiedy jestem dostępny",
    showAvailabilityHelp:
      "Wyłączone: w kryzysie koordynator zobaczy „nie podano”. Twoje miejsce na liście się nie zmienia.",
    allowContactRevealLabel: "Pozwól koordynatorowi awaryjnie odsłonić mój numer",
    allowContactRevealHelp:
      "Gdy w kryzysie nie da się zawiadomić ludzi inaczej, koordynator może po podaniu powodu zobaczyć numery. Wyłączone: Twój numer zostanie pominięty.",
    submit: "Zapisz profil",
    submitting: "Zapisywanie…",
    chooseLevelFor: "Wybierz poziom dla: {skills}.",
  },
  skills: {
    level1: "Podstawowy kurs",
    level2: "Praktyk",
    level3: "Profesjonalista",
    levelLegend: "Poziom: {skill}",
    chooseLevel: "Wybierz poziom.",
    useInCrisis: "Używaj w kryzysie",
    useInCrisisFor: "Używaj w kryzysie: {skill}",
  },
  location: {
    postcodeLabel: "Kod pocztowy",
    postcodeInvalid: POSTCODE_ERROR,
    searching: "Szukam kodu…",
    unknownPostcode: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.",
    lookupFailed: "Nie udało się sprawdzić kodu. Zaznacz lokalizację na mapie.",
    fromPostcode: "Ustawiono z kodu pocztowego",
    mapLabel: "Albo kliknij mapę lub przeciągnij znacznik",
    outsidePoland: OUTSIDE_POLAND_ERROR,
    moveMarker: "Przesuń znacznik.",
    privacyHint: "Lokalizacja jest zaokrąglana do ok. 500 m — nikt nie zobaczy Twojego dokładnego adresu.",
    zoomIn: "Przybliż",
    zoomOut: "Oddal",
  },
  phone: {
    label: "Numer telefonu komórkowego",
    onlyYou: "Numer widzisz tylko Ty.",
    future:
      "W przyszłych wersjach koordynator zobaczy go w trybie kryzysowym dopiero po tym, jak potwierdzisz gotowość do pomocy.",
    noAlerts: "Bez numeru nie otrzymasz alertów kryzysowych.",
    invalid: PHONE_ERROR,
  },
  availability: {
    always: "Zawsze / o każdej porze",
    clear: "Wyczyść",
    gridLabel: "Tygodniowa dostępność",
    dayLabels: ["pn", "wt", "śr", "cz", "pt", "sb", "nd"],
    dayNames: ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"],
    slotNames: ["noc", "rano", "popołudnie", "wieczór"],
  },
  pause: {
    titlePause: "Wstrzymaj dostępność",
    titleChange: "Zmień wstrzymanie dostępności",
    help: "Na czas wstrzymania nie pojawisz się w nowych kryzysach ani na mapie, a w trwających kryzysach koordynator Cię nie widzi. Twój profil i konto zostają bez zmian.",
    howLong: "Jak długo",
    untilDate: "Do dnia (włącznie)",
    lastDay: "Ostatni dzień wstrzymania",
    indefinitely: "Bezterminowo, do wznowienia",
    submitPause: "Wstrzymaj dostępność",
    submitChange: "Zmień wstrzymanie",
    invalidDate: "Wybierz datę od dziś do roku naprzód.",
    profileRequired: "Najpierw uzupełnij profil.",
    failed: "Nie udało się wstrzymać dostępności. Spróbuj ponownie.",
    resumeFailed: "Nie udało się wznowić dostępności. Spróbuj ponownie.",
  },
  reveals: {
    title: "Kto widział mój numer",
    help: "Koordynator może zobaczyć Twój numer tylko w trwającym kryzysie i po podaniu powodu. Każde takie odsłonięcie jest zapisywane i widzisz je tutaj.",
    loadFailed: "Nie udało się wczytać listy. Odśwież stronę.",
    none: "Nikt jeszcze nie odsłonił Twojego numeru.",
    near: "okolice {postcode}",
  },
  deleteAccount: {
    title: "Usuń konto",
    consequence:
      "Twoje konto, profil, umiejętności, numer telefonu i dostępność zostaną usunięte natychmiast. Tej operacji nie można cofnąć.",
    auditNote:
      "Dzienniki audytowe zachowują wyłącznie anonimowy identyfikator, który po usunięciu konta nie wskazuje na żadną osobę.",
    passwordLabel: "Potwierdź hasłem",
    submit: "Usuń konto na zawsze",
    passwordRequired: "Podaj hasło, aby usunąć konto.",
    noPasswordAccount: "Tego konta nie można usunąć hasłem.",
    wrongPassword: "Nieprawidłowe hasło.",
    reauthenticate: "Potwierdź hasło ponownie.",
    failed: "Nie udało się usunąć konta. Spróbuj ponownie.",
  },
  errors: {
    pinRequired: "Zaznacz lokalizację na mapie.",
    invalidLocation: "Nieprawidłowa lokalizacja.",
    invalidSkill: "Nieprawidłowa umiejętność lub poziom.",
    tooManySkills: "Możesz wybrać najwyżej {max} umiejętności.",
    duplicateSkills: "Umiejętności się powtarzają.",
    invalidPhone: PHONE_ERROR,
    invalidPostcode: POSTCODE_ERROR,
    invalidAvailability: "Nieprawidłowa dostępność.",
    invalidSwitch: "Nieprawidłowe ustawienie widoczności.",
    crisisOffUnknownSkill: CRISIS_OFF_UNKNOWN_SKILL,
    invalidForm: "Nieprawidłowe dane formularza.",
    unknownPostcode: "Nie znamy tego kodu pocztowego — zaznacz lokalizację na mapie.",
    outsidePoland: OUTSIDE_POLAND_ERROR,
    levelRequired: "Wybierz poziom dla każdej zaznaczonej umiejętności.",
    levelNotApplicable: "Ta umiejętność nie ma poziomu.",
    unknownSkill: "Nieznana umiejętność.",
    saveFailed: "Nie udało się zapisać profilu. Spróbuj ponownie.",
  },
};

export type ProfileMessages = typeof pl;

const EN_PHONE_ERROR = "Enter a Polish mobile number, e.g. 600 123 456.";
const EN_POSTCODE_ERROR = "Enter a postcode in the format 00-000.";
const EN_OUTSIDE_POLAND = "The location must be in Poland.";
const EN_UNKNOWN_POSTCODE = "We do not know this postcode — mark the location on the map.";

export const en: ProfileMessages = {
  page: {
    title: "My profile — SkillNet",
    heading: "My profile",
    loadFailed: "Your profile could not be loaded. Refresh the page.",
    formLoading: "Loading the form…",
    pauseNeedsComplete:
      "You can pause your availability once your profile is complete: it has a location and at least one skill.",
  },
  status: {
    pausedUntil: "Your availability is paused until {date} inclusive.",
    pausedIndefinitely: "Your availability is paused with no end date.",
    pausedEffect:
      "You will not appear in new crises or on the map, and the coordinator does not see you in ongoing crises.",
    resume: "Resume availability",
    noCrisisSkills: "None of your skills is used in crises, so the coordinator will not find you.",
    noCrisisSkillsHint: "Tick “Use in a crisis” for at least one skill if you want to help in crises.",
    complete: "Profile complete",
    incompleteLead: "Profile incomplete.",
    incompleteBody: "Add a location and at least one skill so that the coordinator can find you.",
    noPhone: "Without a phone number you will not receive crisis alerts.",
  },
  notices: {
    saved: "Saved.",
    paused: "Availability paused.",
    resumed: "Availability resumed.",
  },
  form: {
    skillsHeading: "Skills and equipment",
    skillsHelp:
      "Tick what you can do or what you have. Choose a level for each skill. Untick “Use in a crisis” if the coordinator should not take a skill into account.",
    locationHeading: "Approximate location",
    locationHelp: "Enter a postcode or mark a place on the map.",
    phoneHeading: "Phone",
    phoneHelp: "Optional.",
    availabilityHeading: "Availability",
    availabilityHelp:
      "Tick when you can usually help. This is only information for the coordinator — it excludes nobody from the list.",
    visibilityHeading: "Data visibility",
    visibilityHelp: "Decide what your data may be used for. Your email and exact location are shown to nobody.",
    showOnMapLabel: "Count me in the public skills map",
    showOnMapHelp:
      "The map shows only ranges of the number of people in 2 × 2 km squares. A change takes effect the next day.",
    showAvailabilityLabel: "Show the coordinator when I am available",
    showAvailabilityHelp: "Off: in a crisis the coordinator sees “not given”. Your place on the list does not change.",
    allowContactRevealLabel: "Let the coordinator reveal my number in an emergency",
    allowContactRevealHelp:
      "When people cannot be reached any other way in a crisis, the coordinator may see phone numbers after giving a reason. Off: your number is left out.",
    submit: "Save profile",
    submitting: "Saving…",
    chooseLevelFor: "Choose a level for: {skills}.",
  },
  skills: {
    level1: "Basic course",
    level2: "Practitioner",
    level3: "Professional",
    levelLegend: "Level: {skill}",
    chooseLevel: "Choose a level.",
    useInCrisis: "Use in a crisis",
    useInCrisisFor: "Use in a crisis: {skill}",
  },
  location: {
    postcodeLabel: "Postcode",
    postcodeInvalid: EN_POSTCODE_ERROR,
    searching: "Looking up the postcode…",
    unknownPostcode: EN_UNKNOWN_POSTCODE,
    lookupFailed: "The postcode could not be checked. Mark the location on the map.",
    fromPostcode: "Set from a postcode",
    mapLabel: "Or click the map or drag the marker",
    outsidePoland: EN_OUTSIDE_POLAND,
    moveMarker: "Move the marker.",
    privacyHint: "The location is rounded to about 500 m — nobody will see your exact address.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
  },
  phone: {
    label: "Mobile phone number",
    onlyYou: "Only you see the number.",
    future:
      "In future versions the coordinator will see it in crisis mode only after you confirm that you are ready to help.",
    noAlerts: "Without a number you will not receive crisis alerts.",
    invalid: EN_PHONE_ERROR,
  },
  availability: {
    always: "Always / at any time",
    clear: "Clear",
    gridLabel: "Weekly availability",
    dayLabels: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    dayNames: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    slotNames: ["night", "morning", "afternoon", "evening"],
  },
  pause: {
    titlePause: "Pause availability",
    titleChange: "Change the pause",
    help: "While paused, you will not appear in new crises or on the map, and the coordinator does not see you in ongoing crises. Your profile and account stay as they are.",
    howLong: "How long",
    untilDate: "Until this day (inclusive)",
    lastDay: "Last day of the pause",
    indefinitely: "With no end date, until you resume",
    submitPause: "Pause availability",
    submitChange: "Change the pause",
    invalidDate: "Choose a date from today to a year ahead.",
    profileRequired: "Complete your profile first.",
    failed: "Your availability could not be paused. Try again.",
    resumeFailed: "Your availability could not be resumed. Try again.",
  },
  reveals: {
    title: "Who has seen my number",
    help: "The coordinator can see your number only during an ongoing crisis and after giving a reason. Every such reveal is recorded and you see it here.",
    loadFailed: "The list could not be loaded. Refresh the page.",
    none: "Nobody has revealed your number yet.",
    near: "near {postcode}",
  },
  deleteAccount: {
    title: "Delete account",
    consequence:
      "Your account, profile, skills, phone number and availability will be deleted immediately. This cannot be undone.",
    auditNote: "Audit logs keep only an anonymous identifier, which points to no person once the account is deleted.",
    passwordLabel: "Confirm with your password",
    submit: "Delete account for good",
    passwordRequired: "Enter your password to delete the account.",
    noPasswordAccount: "This account cannot be deleted with a password.",
    wrongPassword: "Wrong password.",
    reauthenticate: "Confirm your password again.",
    failed: "The account could not be deleted. Try again.",
  },
  errors: {
    pinRequired: "Mark the location on the map.",
    invalidLocation: "Invalid location.",
    invalidSkill: "Invalid skill or level.",
    tooManySkills: "You can choose at most {max} skills.",
    duplicateSkills: "Some skills are repeated.",
    invalidPhone: EN_PHONE_ERROR,
    invalidPostcode: EN_POSTCODE_ERROR,
    invalidAvailability: "Invalid availability.",
    invalidSwitch: "Invalid visibility setting.",
    crisisOffUnknownSkill: "A skill that is not ticked cannot be hidden from crises.",
    invalidForm: "Invalid form data.",
    unknownPostcode: EN_UNKNOWN_POSTCODE,
    outsidePoland: EN_OUTSIDE_POLAND,
    levelRequired: "Choose a level for every ticked skill.",
    levelNotApplicable: "This skill has no level.",
    unknownSkill: "Unknown skill.",
    saveFailed: "Your profile could not be saved. Try again.",
  },
};

const UK_PHONE_ERROR = "Вкажіть польський мобільний номер, напр. 600 123 456.";
const UK_POSTCODE_ERROR = "Вкажіть поштовий індекс у форматі 00-000.";
const UK_OUTSIDE_POLAND = "Місце має бути в Польщі.";
const UK_UNKNOWN_POSTCODE = "Ми не знаємо цього поштового індексу — позначте місце на мапі.";

export const uk: ProfileMessages = {
  page: {
    title: "Мій профіль — SkillNet",
    heading: "Мій профіль",
    loadFailed: "Не вдалося завантажити профіль. Оновіть сторінку.",
    formLoading: "Завантаження форми…",
    pauseNeedsComplete:
      "Призупинити доступність можна, коли профіль повний: має місце розташування і принаймні одне вміння.",
  },
  status: {
    pausedUntil: "Вашу доступність призупинено до {date} включно.",
    pausedIndefinitely: "Вашу доступність призупинено безстроково.",
    pausedEffect: "Ви не з’явитеся в нових кризах і на мапі, а в поточних кризах координатор вас не бачить.",
    resume: "Відновити доступність",
    noCrisisSkills: "Жодне з ваших умінь не використовується в кризах, тому координатор вас не знайде.",
    noCrisisSkillsHint:
      "Позначте «Використовувати в кризі» принаймні біля одного вміння, якщо хочете допомагати в кризах.",
    complete: "Профіль повний",
    incompleteLead: "Профіль неповний.",
    incompleteBody: "Додайте місце розташування і принаймні одне вміння, щоб координатор міг вас знайти.",
    noPhone: "Без номера телефону ви не отримаєте кризових сповіщень.",
  },
  notices: {
    saved: "Збережено.",
    paused: "Доступність призупинено.",
    resumed: "Доступність відновлено.",
  },
  form: {
    skillsHeading: "Уміння та спорядження",
    skillsHelp:
      "Позначте, що ви вмієте або що маєте. Для вмінь виберіть рівень. Зніміть позначку «Використовувати в кризі», якщо координатор не має враховувати це вміння.",
    locationHeading: "Приблизне місце розташування",
    locationHelp: "Введіть поштовий індекс або позначте місце на мапі.",
    phoneHeading: "Телефон",
    phoneHelp: "Необов’язково.",
    availabilityHeading: "Доступність",
    availabilityHelp:
      "Позначте, коли ви зазвичай можете допомогти. Це лише інформація для координатора — вона нікого не виключає зі списку.",
    visibilityHeading: "Видимість даних",
    visibilityHelp:
      "Вирішіть, для чого можна використовувати ваші дані. Електронну адресу й точне місце нікому не показуємо.",
    showOnMapLabel: "Враховувати мене на публічній мапі вмінь",
    showOnMapHelp: "Мапа показує лише діапазони кількості людей у квадратах 2 × 2 км. Зміна діє з наступного дня.",
    showAvailabilityLabel: "Показувати координаторові, коли я доступний",
    showAvailabilityHelp: "Вимкнено: у кризі координатор побачить «не вказано». Ваше місце у списку не змінюється.",
    allowContactRevealLabel: "Дозволити координаторові в екстреному разі відкрити мій номер",
    allowContactRevealHelp:
      "Коли в кризі неможливо повідомити людей інакше, координатор може побачити номери, вказавши причину. Вимкнено: ваш номер буде пропущено.",
    submit: "Зберегти профіль",
    submitting: "Збереження…",
    chooseLevelFor: "Виберіть рівень для: {skills}.",
  },
  skills: {
    level1: "Базовий курс",
    level2: "Практик",
    level3: "Професіонал",
    levelLegend: "Рівень: {skill}",
    chooseLevel: "Виберіть рівень.",
    useInCrisis: "Використовувати в кризі",
    useInCrisisFor: "Використовувати в кризі: {skill}",
  },
  location: {
    postcodeLabel: "Поштовий індекс",
    postcodeInvalid: UK_POSTCODE_ERROR,
    searching: "Шукаю індекс…",
    unknownPostcode: UK_UNKNOWN_POSTCODE,
    lookupFailed: "Не вдалося перевірити індекс. Позначте місце на мапі.",
    fromPostcode: "Встановлено за поштовим індексом",
    mapLabel: "Або клацніть мапу чи перетягніть позначку",
    outsidePoland: UK_OUTSIDE_POLAND,
    moveMarker: "Пересуньте позначку.",
    privacyHint: "Місце округлюється приблизно до 500 м — ніхто не побачить вашої точної адреси.",
    zoomIn: "Наблизити",
    zoomOut: "Віддалити",
  },
  phone: {
    label: "Номер мобільного телефону",
    onlyYou: "Номер бачите лише ви.",
    future:
      "У майбутніх версіях координатор побачить його в кризовому режимі лише після того, як ви підтвердите готовність допомогти.",
    noAlerts: "Без номера ви не отримаєте кризових сповіщень.",
    invalid: UK_PHONE_ERROR,
  },
  availability: {
    always: "Завжди / будь-коли",
    clear: "Очистити",
    gridLabel: "Тижнева доступність",
    dayLabels: ["пн", "вт", "ср", "чт", "пт", "сб", "нд"],
    dayNames: ["понеділок", "вівторок", "середа", "четвер", "п’ятниця", "субота", "неділя"],
    slotNames: ["ніч", "ранок", "день", "вечір"],
  },
  pause: {
    titlePause: "Призупинити доступність",
    titleChange: "Змінити призупинення доступності",
    help: "На час призупинення ви не з’явитеся в нових кризах і на мапі, а в поточних кризах координатор вас не бачить. Ваш профіль і акаунт залишаються без змін.",
    howLong: "На який час",
    untilDate: "До дня (включно)",
    lastDay: "Останній день призупинення",
    indefinitely: "Безстроково, до відновлення",
    submitPause: "Призупинити доступність",
    submitChange: "Змінити призупинення",
    invalidDate: "Виберіть дату від сьогодні до року наперед.",
    profileRequired: "Спочатку заповніть профіль.",
    failed: "Не вдалося призупинити доступність. Спробуйте ще раз.",
    resumeFailed: "Не вдалося відновити доступність. Спробуйте ще раз.",
  },
  reveals: {
    title: "Хто бачив мій номер",
    help: "Координатор може побачити ваш номер лише під час поточної кризи і вказавши причину. Кожне таке відкриття записується, і ви бачите його тут.",
    loadFailed: "Не вдалося завантажити список. Оновіть сторінку.",
    none: "Ніхто ще не відкривав вашого номера.",
    near: "околиці {postcode}",
  },
  deleteAccount: {
    title: "Видалити акаунт",
    consequence:
      "Ваш акаунт, профіль, уміння, номер телефону й доступність буде видалено негайно. Цю дію неможливо скасувати.",
    auditNote:
      "Журнали аудиту зберігають лише анонімний ідентифікатор, який після видалення акаунта не вказує на жодну особу.",
    passwordLabel: "Підтвердьте паролем",
    submit: "Видалити акаунт назавжди",
    passwordRequired: "Введіть пароль, щоб видалити акаунт.",
    noPasswordAccount: "Цей акаунт неможливо видалити за допомогою пароля.",
    wrongPassword: "Неправильний пароль.",
    reauthenticate: "Підтвердьте пароль ще раз.",
    failed: "Не вдалося видалити акаунт. Спробуйте ще раз.",
  },
  errors: {
    pinRequired: "Позначте місце на мапі.",
    invalidLocation: "Неправильне місце розташування.",
    invalidSkill: "Неправильне вміння або рівень.",
    tooManySkills: "Можна вибрати щонайбільше {max} умінь.",
    duplicateSkills: "Уміння повторюються.",
    invalidPhone: UK_PHONE_ERROR,
    invalidPostcode: UK_POSTCODE_ERROR,
    invalidAvailability: "Неправильна доступність.",
    invalidSwitch: "Неправильне налаштування видимості.",
    crisisOffUnknownSkill: "Не можна приховати в кризі вміння, яке не позначено.",
    invalidForm: "Неправильні дані форми.",
    unknownPostcode: UK_UNKNOWN_POSTCODE,
    outsidePoland: UK_OUTSIDE_POLAND,
    levelRequired: "Виберіть рівень для кожного позначеного вміння.",
    levelNotApplicable: "Це вміння не має рівня.",
    unknownSkill: "Невідоме вміння.",
    saveFailed: "Не вдалося зберегти профіль. Спробуйте ще раз.",
  },
};

export const profile: Record<Locale, ProfileMessages> = { pl, en, uk };

// The coordinator area and crisis mode (roadmap S-20): names of crisis types, team templates, team
// roles and ready exercises by slug, the words of crisis formatting, the reason rule, the coordinator
// panel and the activation form. Polish is the shape; `en` and `uk` are typed as it. Relative
// imports only, so `node:test` loads it.
//
// The names come from the database in Polish only (`name_pl`); crisis.test.ts checks them against
// the seed migrations and `supabase/seed.sql`. Text a coordinator types (activation and break-glass
// reasons) and an exercise's stored reason are never translated. Postcodes and the 3-per-hour limit
// are the same in every language. The Ukrainian text waits for a native reader.

import type { Locale } from "../locale.ts";

export const pl = {
  names: {
    crisisTypes: {
      powodz: "Powódź",
      "awaria-pradu": "Awaria prądu",
      "wypadek-masowy": "Wypadek masowy",
      pozar: "Pożar",
      "upaly-mroz": "Upały / mróz",
      "cyberatak-blackout": "Cyberatak / blackout",
    },
    teamTemplates: {
      ewakuacyjny: "Zespół ewakuacyjny",
      techniczny: "Zespół techniczny",
      opiekunczy: "Zespół opiekuńczy (upały/mrozy)",
      "punkt-medyczny": "Punkt medyczny",
    },
    /** By `template/role`: a role slug repeats across templates with different names. */
    teamRoles: {
      "ewakuacyjny/medyk": "Medyk",
      "ewakuacyjny/osoba-silna": "Osoba silna fizycznie",
      "ewakuacyjny/kierowca": "Kierowca z pojazdem",
      "techniczny/elektryk": "Elektryk",
      "techniczny/narzedzia": "Osoba z narzędziami",
      "techniczny/kierowca": "Kierowca",
      "opiekunczy/medyk-opiekun": "Medyk lub opiekun",
      "opiekunczy/kierowca": "Kierowca",
      "opiekunczy/lokal": "Wolontariusz z lokalem",
      "punkt-medyczny/medyk": "Medyk lub ratownik",
      "punkt-medyczny/logistyk": "Logistyk",
    },
    scenarios: {
      "powodz-podgorze": "Powódź w Podgórzu",
      "awaria-pradu-stare-miasto": "Awaria prądu na Starym Mieście",
      "pozar-nowa-huta": "Pożar w Nowej Hucie",
      "wypadek-masowy-krowodrza": "Wypadek masowy na Krowodrzy",
      "upaly-krakow": "Fala upałów w Krakowie",
    },
  },
  format: {
    /** How long a crisis has been active, lowercase: pages capitalise it at the start of a sentence. */
    activeFor: {
      justNow: "aktywny od chwili",
      minutes: "aktywny od {count} min",
      hours: "aktywny od {count} godz.",
      days: {
        one: "aktywny od {count} dnia",
        few: "aktywny od {count} dni",
        many: "aktywny od {count} dni",
        other: "aktywny od {count} dni",
      },
    },
    people: {
      one: "{count} osoba",
      few: "{count} osoby",
      many: "{count} osób",
      other: "{count} osoby",
    },
    /** The word after `people`: "1 osoba dopasowana", "5 osób dopasowanych". */
    matched: {
      one: "dopasowana",
      few: "dopasowane",
      many: "dopasowanych",
      other: "dopasowanych",
    },
    km: "{km} km",
    underHalfKm: "< 0,5 km",
    place: "okolice {postcode}",
  },
  availability: {
    now: "Deklaruje dostępność teraz",
    notNow: "Teraz poza deklarowaną dostępnością",
    unknown: "Dostępności nie podano",
    always: "zawsze",
    wholeDay: "cały dzień",
  },
  reason: {
    required: "Opisz powód słowami: co najmniej {min} znaków i dwa słowa.",
    tooLong: "Powód może mieć najwyżej {max} znaków.",
  },
  panel: {
    title: "Panel koordynatora — SkillNet",
    heading: "Panel koordynatora",
    ended: "Kryzys zakończony. Lista dopasowanych osób została usunięta.",
    notActivated: "Kryzysu nie aktywowano.",
    loadFailed: "Nie udało się wczytać panelu. Odśwież stronę.",
    activeHeading: "Aktywne kryzysy",
    noActive: "Brak aktywnych kryzysów.",
    exerciseTag: "ćwiczenie",
    stale: "{activeFor}. Sprawdź, czy nadal trwa.",
    activatedAt: "aktywowano {time}",
    activateHeading: "Aktywuj kryzys",
    activateIntro: "Wybierz rodzaj, wskaż epicentrum i promień. Po aktywacji dostaniesz listę mieszkańców z okolicy.",
    formLoading: "Ładowanie formularza…",
    exercisesHeading: "Ćwiczenia",
    exercisesIntro:
      "Gotowe scenariusze do treningu i pokazów. Ćwiczenie działa jak kryzys, na prawdziwej liście mieszkańców, ale nikt nie dostaje alertu, a numerów telefonów nie można ujawnić. Uruchamia się od razu i liczy do limitu 3 aktywacji na godzinę.",
    startExercise: "Uruchom ćwiczenie",
    endedHeading: "Zakończone",
    endedAt: "Zakończony {time}",
    endedNoTime: "Zakończony",
  },
  form: {
    typeLabel: "Rodzaj kryzysu",
    choose: "Wybierz…",
    epicentre: "Epicentrum",
    epicentreHelp: "Wpisz kod pocztowy albo zaznacz miejsce na mapie.",
    epicentreHint:
      "Epicentrum to środek obszaru, w którym szukamy mieszkańców. Zapisujemy je dokładnie, bez zaokrąglania.",
    radius: "Promień",
    reasonLabel: "Powód aktywacji",
    reasonPlaceholder: "np. pożar budynku przy ul. Długiej, potrzebni ratownicy",
    reasonHint:
      "Od {min} do {max} znaków, co najmniej dwa słowa. Powód zapisujemy razem z kryzysem i Twoim kontem. Jeden koordynator może aktywować najwyżej 3 kryzysy na godzinę.",
    exerciseLabel: "To jest ćwiczenie",
    exerciseHint:
      "Lista powstanie z prawdziwych mieszkańców, ale nikt nie dostanie alertu, a numerów telefonów nie będzie można ujawnić. Tego nie da się zmienić po aktywacji.",
    needEpicentre: "Wskaż epicentrum, aby aktywować.",
    activating: "Aktywuję…",
    activateExercise: "Aktywuj ćwiczenie",
    activateCrisis: "Aktywuj kryzys",
  },
  /** Messages for the activation form and the exercise start, by the code `activate_crisis` raises. */
  activate: {
    failed: "Nie udało się aktywować trybu kryzysowego. Spróbuj ponownie.",
    not_coordinator: "Tylko koordynator może aktywować tryb kryzysowy.",
    unknown_crisis_type: "Wybierz rodzaj kryzysu z listy.",
    invalid_radius: "Wybierz promień z listy.",
    unknown_postcode: "Nie znamy tego kodu pocztowego — zaznacz epicentrum na mapie.",
    outside_poland: "Epicentrum musi być w Polsce.",
    location_required: "Wskaż epicentrum: wpisz kod pocztowy albo zaznacz punkt na mapie.",
    activation_rate_limited:
      "Limit aktywacji: najwyżej 3 kryzysy na godzinę na jednego koordynatora, licząc też zakończone. Spróbuj później albo poproś o aktywację innego koordynatora.",
    chooseType: "Wybierz rodzaj kryzysu.",
    invalidLocation: "Nieprawidłowa lokalizacja epicentrum.",
    invalidForm: "Nieprawidłowe dane formularza.",
    chooseExercise: "Wybierz ćwiczenie z listy.",
    exerciseNotFound: "Nie znaleziono tego ćwiczenia. Odśwież stronę i wybierz je z listy.",
  },
  crisisPage: {
    title: "{kind}: {type} — SkillNet",
    kindCrisis: "Kryzys",
    kindExercise: "Ćwiczenie",
    notFound: "Nie znaleziono kryzysu",
    notFoundTitle: "Nie znaleziono kryzysu — SkillNet",
    notFoundText: "Ten kryzys nie istnieje albo nie masz do niego dostępu.",
    loadFailed: "Nie udało się wczytać listy. Odśwież stronę.",
    endedListGone: "Lista osób została usunięta po zakończeniu kryzysu.",
    listNote:
      "Kolejność i umiejętności to stan z chwili aktywacji. Dostępność to aktualna deklaracja mieszkańca, sprawdzana względem bieżącej godziny, i nie wpływa na kolejność. Numery telefonów są domyślnie ukryte. „Bez telefonu” oznacza, że ta osoba nie otrzyma alertu.",
    assembleTeams: "Złóż zespoły",
    assembleTeamsHelp: "Potrzebujesz gotowych składów? Złóż zespoły z szablonu (np. ewakuacyjny) z osób z tej listy.",
    revealContacts: "Ujawnij kontakty",
    revealContactsHelp:
      "Nikt nie potwierdza? Możesz ujawnić numery wszystkich dopasowanych osób. Każde ujawnienie jest zapisywane razem z Twoim kontem i powodem.",
    matchesHeading: "Dopasowane osoby",
    noMatches: "W tym promieniu nie ma dopasowanych mieszkańców.",
    matchesIntro: "Od najlepiej dopasowanej. Pogrubione umiejętności są priorytetowe dla tego rodzaju kryzysu.",
    /** Read before the rank number by screen readers. */
    rank: "Miejsce",
    person: "Osoba #{position}",
    /** Read after the distance by screen readers. */
    fromEpicentre: "od epicentrum",
    moreHidden: "Pokazano pierwsze {count}. Niewyświetlonych: {people}.",
  },
  facts: {
    ended: "Kryzys zakończony",
    active: "Kryzys {activeFor}",
    stale: "Kryzys {activeFor}. Sprawdź, czy nadal trwa.",
    exercise: "Ćwiczenie",
    exerciseNote: "Lista to prawdziwi mieszkańcy, ale nikt nie dostaje alertu, a numerów telefonów nie można ujawnić.",
    type: "Rodzaj",
    radius: "Promień",
    area: "Obszar",
    activatedAt: "Aktywowano",
    endedAt: "Zakończono",
    matched: "Dopasowano",
  },
  coverage: {
    heading: "Pokrycie umiejętności",
    missing: "W promieniu brakuje: {names}.",
    missingHelp:
      "Priorytetowe umiejętności na liście: {covered} z {total}. Rozważ większy promień albo pomoc z zewnątrz.",
    allCovered: "Każda priorytetowa umiejętność ({total}) ma na liście co najmniej jedną osobę.",
    priority: "Priorytetowe",
    supporting: "Wspierające",
    nobody: "nikt w promieniu",
    availableNow: "teraz dostępne: {count}",
    note: "Liczymy osoby z całej listy, nie tylko z pierwszej strony. Jedna osoba może mieć kilka umiejętności. „Teraz dostępne” to osoby, które udostępniają dostępność i deklarują ją na tę godzinę.",
  },
  person: {
    /** Read before the declared hours by screen readers. */
    declared: "Deklarowana dostępność:",
    noPhone: "bez telefonu",
    prioritySkill: "umiejętność priorytetowa",
    supportingSkill: "umiejętność wspierająca",
  },
  /** Ending a crisis: the dialog and the messages of `end_crisis`, by the code it raises. */
  end: {
    button: "Zakończ kryzys",
    title: "Zakończyć kryzys?",
    consequence: "Lista dopasowanych osób zostanie trwale usunięta. Tej operacji nie można cofnąć.",
    cancel: "Anuluj",
    failed: "Nie udało się zakończyć kryzysu. Spróbuj ponownie.",
    not_coordinator: "Tylko koordynator może zakończyć tryb kryzysowy.",
    unknown_crisis: "Nie znaleziono kryzysu.",
    alreadyEnded: "Ten kryzys został już zakończony.",
  },
};

export type CrisisMessages = typeof pl;

export const en: CrisisMessages = {
  names: {
    crisisTypes: {
      powodz: "Flood",
      "awaria-pradu": "Power outage",
      "wypadek-masowy": "Mass casualty incident",
      pozar: "Fire",
      "upaly-mroz": "Heat / extreme cold",
      "cyberatak-blackout": "Cyberattack / blackout",
    },
    teamTemplates: {
      ewakuacyjny: "Evacuation team",
      techniczny: "Technical team",
      opiekunczy: "Care team (heat/cold)",
      "punkt-medyczny": "Medical point",
    },
    teamRoles: {
      "ewakuacyjny/medyk": "Medic",
      "ewakuacyjny/osoba-silna": "Physically strong person",
      "ewakuacyjny/kierowca": "Driver with a vehicle",
      "techniczny/elektryk": "Electrician",
      "techniczny/narzedzia": "Person with tools",
      "techniczny/kierowca": "Driver",
      "opiekunczy/medyk-opiekun": "Medic or carer",
      "opiekunczy/kierowca": "Driver",
      "opiekunczy/lokal": "Volunteer with premises",
      "punkt-medyczny/medyk": "Medic or paramedic",
      "punkt-medyczny/logistyk": "Logistician",
    },
    scenarios: {
      "powodz-podgorze": "Flood in Podgórze",
      "awaria-pradu-stare-miasto": "Power outage in the Old Town",
      "pozar-nowa-huta": "Fire in Nowa Huta",
      "wypadek-masowy-krowodrza": "Mass casualty incident in Krowodrza",
      "upaly-krakow": "Heat wave in Kraków",
    },
  },
  format: {
    activeFor: {
      justNow: "active for under a minute",
      minutes: "active for {count} min",
      hours: "active for {count} h",
      days: {
        one: "active for {count} day",
        few: "active for {count} days",
        many: "active for {count} days",
        other: "active for {count} days",
      },
    },
    people: {
      one: "{count} person",
      few: "{count} people",
      many: "{count} people",
      other: "{count} people",
    },
    matched: {
      one: "matched",
      few: "matched",
      many: "matched",
      other: "matched",
    },
    km: "{km} km",
    underHalfKm: "< 0.5 km",
    place: "near {postcode}",
  },
  availability: {
    now: "Declared available now",
    notNow: "Outside declared availability now",
    unknown: "Availability not given",
    always: "always",
    wholeDay: "all day",
  },
  reason: {
    required: "Describe the reason in words: at least {min} characters and two words.",
    tooLong: "The reason can be at most {max} characters.",
  },
  panel: {
    title: "Coordinator panel — SkillNet",
    heading: "Coordinator panel",
    ended: "Crisis ended. The list of matched people has been deleted.",
    notActivated: "The crisis was not activated.",
    loadFailed: "Could not load the panel. Refresh the page.",
    activeHeading: "Active crises",
    noActive: "No active crises.",
    exerciseTag: "exercise",
    stale: "{activeFor}. Check whether it is still going on.",
    activatedAt: "activated {time}",
    activateHeading: "Activate a crisis",
    activateIntro:
      "Choose the type, mark the epicentre and the radius. After activation you get a list of residents in the area.",
    formLoading: "Loading the form…",
    exercisesHeading: "Exercises",
    exercisesIntro:
      "Ready-made scenarios for training and demonstrations. An exercise works like a crisis, on the real list of residents, but nobody gets an alert and phone numbers cannot be revealed. It starts at once and counts towards the limit of 3 activations per hour.",
    startExercise: "Start exercise",
    endedHeading: "Ended",
    endedAt: "Ended {time}",
    endedNoTime: "Ended",
  },
  form: {
    typeLabel: "Crisis type",
    choose: "Choose…",
    epicentre: "Epicentre",
    epicentreHelp: "Enter a postcode or mark the place on the map.",
    epicentreHint:
      "The epicentre is the centre of the area where we look for residents. We store it exactly, without rounding.",
    radius: "Radius",
    reasonLabel: "Reason for activation",
    reasonPlaceholder: "e.g. building fire on Długa Street, rescuers needed",
    reasonHint:
      "{min} to {max} characters, at least two words. We store the reason with the crisis and your account. One coordinator can activate at most 3 crises per hour.",
    exerciseLabel: "This is an exercise",
    exerciseHint:
      "The list is built from real residents, but nobody will get an alert and phone numbers cannot be revealed. This cannot be changed after activation.",
    needEpicentre: "Mark the epicentre to activate.",
    activating: "Activating…",
    activateExercise: "Activate exercise",
    activateCrisis: "Activate crisis",
  },
  activate: {
    failed: "Could not activate crisis mode. Try again.",
    not_coordinator: "Only a coordinator can activate crisis mode.",
    unknown_crisis_type: "Choose a crisis type from the list.",
    invalid_radius: "Choose a radius from the list.",
    unknown_postcode: "We don't know this postcode — mark the epicentre on the map.",
    outside_poland: "The epicentre must be in Poland.",
    location_required: "Mark the epicentre: enter a postcode or mark a point on the map.",
    activation_rate_limited:
      "Activation limit: at most 3 crises per hour per coordinator, ended ones included. Try later or ask another coordinator to activate it.",
    chooseType: "Choose a crisis type.",
    invalidLocation: "Invalid epicentre location.",
    invalidForm: "Invalid form data.",
    chooseExercise: "Choose an exercise from the list.",
    exerciseNotFound: "This exercise was not found. Refresh the page and choose it from the list.",
  },
  crisisPage: {
    title: "{kind}: {type} — SkillNet",
    kindCrisis: "Crisis",
    kindExercise: "Exercise",
    notFound: "Crisis not found",
    notFoundTitle: "Crisis not found — SkillNet",
    notFoundText: "This crisis does not exist or you have no access to it.",
    loadFailed: "Could not load the list. Refresh the page.",
    endedListGone: "The list of people was deleted when the crisis ended.",
    listNote:
      "The order and the skills are as they were at activation. Availability is the resident's current declaration, checked against the current hour, and does not affect the order. Phone numbers are hidden by default. “No phone” means this person will not get an alert.",
    assembleTeams: "Assemble teams",
    assembleTeamsHelp:
      "Need ready line-ups? Assemble teams from a template (e.g. evacuation) out of people on this list.",
    revealContacts: "Reveal contacts",
    revealContactsHelp:
      "Nobody confirming? You can reveal the numbers of everyone matched. Every reveal is logged with your account and the reason.",
    matchesHeading: "Matched people",
    noMatches: "No matched residents within this radius.",
    matchesIntro: "Best match first. Skills in bold are priority skills for this type of crisis.",
    rank: "Rank",
    person: "Person #{position}",
    fromEpicentre: "from the epicentre",
    moreHidden: "Showing the first {count}. Not shown: {people}.",
  },
  facts: {
    ended: "Crisis ended",
    active: "Crisis {activeFor}",
    stale: "Crisis {activeFor}. Check whether it is still going on.",
    exercise: "Exercise",
    exerciseNote: "The list is real residents, but nobody gets an alert and phone numbers cannot be revealed.",
    type: "Type",
    radius: "Radius",
    area: "Area",
    activatedAt: "Activated",
    endedAt: "Ended",
    matched: "Matched",
  },
  coverage: {
    heading: "Skill coverage",
    missing: "Missing within the radius: {names}.",
    missingHelp: "Priority skills on the list: {covered} of {total}. Consider a larger radius or outside help.",
    allCovered: "Every priority skill ({total}) has at least one person on the list.",
    priority: "Priority",
    supporting: "Supporting",
    nobody: "nobody within the radius",
    availableNow: "available now: {count}",
    note: "We count people on the whole list, not only the first page. One person can have several skills. “Available now” are people who share their availability and declare it for this hour.",
  },
  person: {
    declared: "Declared availability:",
    noPhone: "no phone",
    prioritySkill: "priority skill",
    supportingSkill: "supporting skill",
  },
  end: {
    button: "End crisis",
    title: "End the crisis?",
    consequence: "The list of matched people will be permanently deleted. This cannot be undone.",
    cancel: "Cancel",
    failed: "Could not end the crisis. Try again.",
    not_coordinator: "Only a coordinator can end crisis mode.",
    unknown_crisis: "Crisis not found.",
    alreadyEnded: "This crisis has already ended.",
  },
};

export const uk: CrisisMessages = {
  names: {
    crisisTypes: {
      powodz: "Повінь",
      "awaria-pradu": "Відключення електроенергії",
      "wypadek-masowy": "Масовий нещасний випадок",
      pozar: "Пожежа",
      "upaly-mroz": "Спека / мороз",
      "cyberatak-blackout": "Кібератака / блекаут",
    },
    teamTemplates: {
      ewakuacyjny: "Евакуаційна команда",
      techniczny: "Технічна команда",
      opiekunczy: "Команда догляду (спека/мороз)",
      "punkt-medyczny": "Медичний пункт",
    },
    teamRoles: {
      "ewakuacyjny/medyk": "Медик",
      "ewakuacyjny/osoba-silna": "Фізично сильна людина",
      "ewakuacyjny/kierowca": "Водій з транспортом",
      "techniczny/elektryk": "Електрик",
      "techniczny/narzedzia": "Людина з інструментами",
      "techniczny/kierowca": "Водій",
      "opiekunczy/medyk-opiekun": "Медик або доглядальник",
      "opiekunczy/kierowca": "Водій",
      "opiekunczy/lokal": "Волонтер із приміщенням",
      "punkt-medyczny/medyk": "Медик або рятувальник",
      "punkt-medyczny/logistyk": "Логіст",
    },
    scenarios: {
      "powodz-podgorze": "Повінь у Подґуже",
      "awaria-pradu-stare-miasto": "Відключення електроенергії у Старому місті",
      "pozar-nowa-huta": "Пожежа в Новій Гуті",
      "wypadek-masowy-krowodrza": "Масовий нещасний випадок у Кроводжі",
      "upaly-krakow": "Хвиля спеки в Кракові",
    },
  },
  format: {
    activeFor: {
      justNow: "триває менше хвилини",
      minutes: "триває {count} хв",
      hours: "триває {count} год",
      days: {
        one: "триває {count} день",
        few: "триває {count} дні",
        many: "триває {count} днів",
        other: "триває {count} дня",
      },
    },
    people: {
      one: "{count} особа",
      few: "{count} особи",
      many: "{count} осіб",
      other: "{count} особи",
    },
    matched: {
      one: "дібрана",
      few: "дібрані",
      many: "дібраних",
      other: "дібраних",
    },
    km: "{km} км",
    underHalfKm: "< 0,5 км",
    place: "поблизу {postcode}",
  },
  availability: {
    now: "Заявлено доступність зараз",
    notNow: "Зараз поза заявленою доступністю",
    unknown: "Доступність не вказано",
    always: "завжди",
    wholeDay: "увесь день",
  },
  reason: {
    required: "Опишіть причину словами: щонайменше {min} символів і два слова.",
    tooLong: "Причина може мати щонайбільше {max} символів.",
  },
  panel: {
    title: "Панель координатора — SkillNet",
    heading: "Панель координатора",
    ended: "Кризу завершено. Список дібраних осіб видалено.",
    notActivated: "Кризу не активовано.",
    loadFailed: "Не вдалося завантажити панель. Оновіть сторінку.",
    activeHeading: "Активні кризи",
    noActive: "Немає активних криз.",
    exerciseTag: "навчання",
    stale: "{activeFor}. Перевірте, чи криза ще актуальна.",
    activatedAt: "активовано {time}",
    activateHeading: "Активувати кризу",
    activateIntro: "Виберіть тип, позначте епіцентр і радіус. Після активації ви отримаєте список мешканців поблизу.",
    formLoading: "Завантаження форми…",
    exercisesHeading: "Навчання",
    exercisesIntro:
      "Готові сценарії для тренувань і показів. Навчання працює як криза, на справжньому списку мешканців, але ніхто не отримує сповіщення, а номери телефонів розкрити не можна. Запускається одразу й зараховується до ліміту 3 активацій на годину.",
    startExercise: "Почати навчання",
    endedHeading: "Завершені",
    endedAt: "Завершено {time}",
    endedNoTime: "Завершено",
  },
  form: {
    typeLabel: "Тип кризи",
    choose: "Виберіть…",
    epicentre: "Епіцентр",
    epicentreHelp: "Введіть поштовий індекс або позначте місце на мапі.",
    epicentreHint: "Епіцентр — це центр території, де ми шукаємо мешканців. Ми зберігаємо його точно, без округлення.",
    radius: "Радіус",
    reasonLabel: "Причина активації",
    reasonPlaceholder: "напр. пожежа будинку на вул. Длуга, потрібні рятувальники",
    reasonHint:
      "Від {min} до {max} символів, щонайменше два слова. Причину ми зберігаємо разом із кризою та вашим обліковим записом. Один координатор може активувати щонайбільше 3 кризи на годину.",
    exerciseLabel: "Це навчання",
    exerciseHint:
      "Список буде складено зі справжніх мешканців, але ніхто не отримає сповіщення, а номери телефонів розкрити не вдасться. Цього не можна змінити після активації.",
    needEpicentre: "Позначте епіцентр, щоб активувати.",
    activating: "Активую…",
    activateExercise: "Активувати навчання",
    activateCrisis: "Активувати кризу",
  },
  activate: {
    failed: "Не вдалося активувати кризовий режим. Спробуйте ще раз.",
    not_coordinator: "Лише координатор може активувати кризовий режим.",
    unknown_crisis_type: "Виберіть тип кризи зі списку.",
    invalid_radius: "Виберіть радіус зі списку.",
    unknown_postcode: "Ми не знаємо цього поштового індексу — позначте епіцентр на мапі.",
    outside_poland: "Епіцентр має бути в Польщі.",
    location_required: "Позначте епіцентр: введіть поштовий індекс або позначте точку на мапі.",
    activation_rate_limited:
      "Ліміт активацій: щонайбільше 3 кризи на годину на одного координатора, враховуючи й завершені. Спробуйте пізніше або попросіть активувати іншого координатора.",
    chooseType: "Виберіть тип кризи.",
    invalidLocation: "Неправильне розташування епіцентру.",
    invalidForm: "Неправильні дані форми.",
    chooseExercise: "Виберіть навчання зі списку.",
    exerciseNotFound: "Це навчання не знайдено. Оновіть сторінку й виберіть його зі списку.",
  },
  crisisPage: {
    title: "{kind}: {type} — SkillNet",
    kindCrisis: "Криза",
    kindExercise: "Навчання",
    notFound: "Кризу не знайдено",
    notFoundTitle: "Кризу не знайдено — SkillNet",
    notFoundText: "Ця криза не існує або у вас немає до неї доступу.",
    loadFailed: "Не вдалося завантажити список. Оновіть сторінку.",
    endedListGone: "Список осіб видалено після завершення кризи.",
    listNote:
      "Порядок і навички — це стан на момент активації. Доступність — це поточна заява мешканця, перевірена щодо поточної години, і вона не впливає на порядок. Номери телефонів за замовчуванням приховано. «Без телефону» означає, що ця особа не отримає сповіщення.",
    assembleTeams: "Скласти команди",
    assembleTeamsHelp: "Потрібні готові склади? Складіть команди за шаблоном (напр. евакуаційна) з осіб цього списку.",
    revealContacts: "Розкрити контакти",
    revealContactsHelp:
      "Ніхто не підтверджує? Ви можете розкрити номери всіх дібраних осіб. Кожне розкриття записується разом із вашим обліковим записом і причиною.",
    matchesHeading: "Дібрані особи",
    noMatches: "У цьому радіусі немає дібраних мешканців.",
    matchesIntro: "Від найкраще дібраної. Навички, виділені жирним, — пріоритетні для цього типу кризи.",
    rank: "Місце",
    person: "Особа #{position}",
    fromEpicentre: "від епіцентру",
    moreHidden: "Показано перші {count}. Не показано: {people}.",
  },
  facts: {
    ended: "Кризу завершено",
    active: "Криза {activeFor}",
    stale: "Криза {activeFor}. Перевірте, чи вона ще актуальна.",
    exercise: "Навчання",
    exerciseNote: "У списку справжні мешканці, але ніхто не отримує сповіщення, а номери телефонів розкрити не можна.",
    type: "Тип",
    radius: "Радіус",
    area: "Територія",
    activatedAt: "Активовано",
    endedAt: "Завершено",
    matched: "Дібрано",
  },
  coverage: {
    heading: "Покриття навичок",
    missing: "У радіусі бракує: {names}.",
    missingHelp: "Пріоритетні навички в списку: {covered} з {total}. Розгляньте більший радіус або допомогу ззовні.",
    allCovered: "Кожна пріоритетна навичка ({total}) має в списку щонайменше одну особу.",
    priority: "Пріоритетні",
    supporting: "Допоміжні",
    nobody: "нікого в радіусі",
    availableNow: "доступні зараз: {count}",
    note: "Ми рахуємо осіб з усього списку, а не лише з першої сторінки. Одна особа може мати кілька навичок. «Доступні зараз» — це особи, які діляться доступністю і заявляють її на цю годину.",
  },
  person: {
    declared: "Заявлена доступність:",
    noPhone: "без телефону",
    prioritySkill: "пріоритетна навичка",
    supportingSkill: "допоміжна навичка",
  },
  end: {
    button: "Завершити кризу",
    title: "Завершити кризу?",
    consequence: "Список дібраних осіб буде остаточно видалено. Цю дію не можна скасувати.",
    cancel: "Скасувати",
    failed: "Не вдалося завершити кризу. Спробуйте ще раз.",
    not_coordinator: "Лише координатор може завершити кризовий режим.",
    unknown_crisis: "Кризу не знайдено.",
    alreadyEnded: "Цю кризу вже завершено.",
  },
};

export const crisis: Record<Locale, CrisisMessages> = { pl, en, uk };

type NameGroup = keyof CrisisMessages["names"];

/**
 * A name from the database in the request's language. Polish always shows the database's own name,
 * the source of truth. In another language a slug the catalogue does not have (one added by a later
 * migration) falls back to that Polish name, so it never shows a key or a blank.
 */
function translatedName(locale: Locale, group: NameGroup, key: string, databaseName: string): string {
  if (locale === "pl") return databaseName;
  const names: Record<string, string | undefined> = crisis[locale].names[group];
  return (Object.hasOwn(names, key) ? names[key] : undefined) ?? databaseName;
}

export function crisisTypeName(locale: Locale, slug: string, databaseName: string): string {
  return translatedName(locale, "crisisTypes", slug, databaseName);
}

export function teamTemplateName(locale: Locale, slug: string, databaseName: string): string {
  return translatedName(locale, "teamTemplates", slug, databaseName);
}

export function teamRoleName(locale: Locale, templateSlug: string, roleSlug: string, databaseName: string): string {
  return translatedName(locale, "teamRoles", `${templateSlug}/${roleSlug}`, databaseName);
}

export function scenarioName(locale: Locale, slug: string, databaseName: string): string {
  return translatedName(locale, "scenarios", slug, databaseName);
}

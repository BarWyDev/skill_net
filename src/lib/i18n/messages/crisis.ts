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

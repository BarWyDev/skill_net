// The public map: the page and its island (filter, postcode jump, legend, empty and error states,
// zoom buttons). Polish is the shape; `en` and `uk` are typed as it. Relative imports only, so
// `node:test` loads it. The Ukrainian text waits for a native reader (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";
import { POSTCODE_ERROR } from "../../postcode.ts";

export const pl = {
  page: {
    title: "Mapa umiejętności — SkillNet",
    description:
      "Ile osób z daną umiejętnością mieszka w Twojej okolicy, w kwadratach 2 × 2 km. Bez danych osobowych: małe skupiska ukrywamy.",
    heading: "Mapa umiejętności",
    lead: "Każdy kwadrat to obszar 2 × 2 km. Kolor pokazuje, ile mieszka w nim osób gotowych pomóc.",
    privacy:
      "Mapa nie pokazuje osób, adresów ani dokładnych liczb. Pokazuje tylko przedziały i tylko tam, gdzie mieszka co najmniej 5 osób, a po wybraniu kategorii co najmniej 10. Przedziały są celowo lekko zaszumione. Mapa odświeża się raz dziennie i uwzględnia konta założone co najmniej 14 dni temu.",
    loading: "Ładowanie mapy…",
    notConfigured: "Mapa jest niedostępna, bo Supabase nie jest skonfigurowany.",
    loadFailed: "Nie udało się wczytać mapy. Odśwież stronę.",
  },
  filter: {
    legend: "Umiejętności",
    all: "Wszystkie",
  },
  postcode: {
    label: "Przejdź do kodu pocztowego",
    // The same sentence as the profile form's own check, which stays Polish until S-19.
    invalid: POSTCODE_ERROR,
    searching: "Szukam kodu…",
    unknown: "Nie znamy tego kodu pocztowego.",
    failed: "Nie udało się sprawdzić kodu. Spróbuj ponownie.",
    areaHint:
      "W skali całej Polski kwadraty 2 km są za małe, żeby je zobaczyć. Wpisz kod pocztowy, a mapa przybliży okolicę.",
  },
  cells: {
    loading: "Wczytuję mapę…",
    failed: "Nie udało się wczytać mapy. Odśwież stronę.",
    emptyForCategory:
      "W żadnym kwadracie nie ma jeszcze 10 osób z umiejętnościami z tej grupy. Mniejsze skupiska ukrywamy dla prywatności.",
    empty: "W żadnym kwadracie nie ma jeszcze 5 osób. Mniejsze skupiska ukrywamy dla prywatności.",
  },
  legend: {
    title: "Osoby w kwadracie 2 × 2 km",
    low: "5–9 osób",
    medium: "10–24 osoby",
    high: "25 i więcej osób",
    hidden: "Kwadraty, w których mieszka mniej niż 5 osób, ukrywamy. Wyglądają tak samo jak puste.",
  },
  zoom: {
    in: "Przybliż",
    out: "Oddal",
  },
};

export type MapMessages = typeof pl;

export const en: MapMessages = {
  page: {
    title: "Skills map — SkillNet",
    description:
      "How many people with a given skill live in your area, in 2 × 2 km squares. No personal data: small clusters are hidden.",
    heading: "Skills map",
    lead: "Each square is an area of 2 × 2 km. The colour shows how many people ready to help live in it.",
    privacy:
      "The map does not show people, addresses or exact numbers. It shows only ranges, and only where at least 5 people live, or at least 10 once a category is chosen. The ranges are deliberately slightly noised. The map refreshes once a day and counts accounts created at least 14 days ago.",
    loading: "Loading the map…",
    notConfigured: "The map is unavailable because Supabase is not configured.",
    loadFailed: "The map could not be loaded. Refresh the page.",
  },
  filter: {
    legend: "Skills",
    all: "All",
  },
  postcode: {
    label: "Go to a postcode",
    invalid: "Enter the postcode in the format 00-000.",
    searching: "Looking up the postcode…",
    unknown: "We do not know this postcode.",
    failed: "The postcode could not be checked. Try again.",
    areaHint:
      "At the scale of all of Poland the 2 km squares are too small to see. Enter a postcode and the map will zoom in on the area.",
  },
  cells: {
    loading: "Loading the map…",
    failed: "The map could not be loaded. Refresh the page.",
    emptyForCategory:
      "No square has 10 people with skills from this group yet. Smaller clusters are hidden for privacy.",
    empty: "No square has 5 people yet. Smaller clusters are hidden for privacy.",
  },
  legend: {
    title: "People in a 2 × 2 km square",
    low: "5–9 people",
    medium: "10–24 people",
    high: "25 or more people",
    hidden: "Squares where fewer than 5 people live are hidden. They look the same as empty ones.",
  },
  zoom: {
    in: "Zoom in",
    out: "Zoom out",
  },
};

export const uk: MapMessages = {
  page: {
    title: "Мапа умінь — SkillNet",
    description:
      "Скільки людей із певним умінням живе у вашій околиці, у квадратах 2 × 2 км. Без персональних даних: малі скупчення ми приховуємо.",
    heading: "Мапа умінь",
    lead: "Кожен квадрат — це ділянка 2 × 2 км. Колір показує, скільки в ньому живе людей, готових допомогти.",
    privacy:
      "Мапа не показує людей, адрес чи точних чисел. Вона показує лише діапазони і лише там, де живе щонайменше 5 людей, а після вибору категорії — щонайменше 10. Діапазони навмисно трохи зашумлені. Мапа оновлюється раз на добу і враховує акаунти, створені щонайменше 14 днів тому.",
    loading: "Завантаження мапи…",
    notConfigured: "Мапа недоступна, бо Supabase не налаштовано.",
    loadFailed: "Не вдалося завантажити мапу. Оновіть сторінку.",
  },
  filter: {
    legend: "Уміння",
    all: "Усі",
  },
  postcode: {
    label: "Перейти до поштового індексу",
    invalid: "Введіть поштовий індекс у форматі 00-000.",
    searching: "Шукаю індекс…",
    unknown: "Ми не знаємо цього поштового індексу.",
    failed: "Не вдалося перевірити індекс. Спробуйте ще раз.",
    areaHint:
      "У масштабі всієї Польщі квадрати 2 км замалі, щоб їх побачити. Введіть поштовий індекс, і мапа наблизить околицю.",
  },
  cells: {
    loading: "Завантажую мапу…",
    failed: "Не вдалося завантажити мапу. Оновіть сторінку.",
    emptyForCategory:
      "У жодному квадраті ще немає 10 людей з уміннями з цієї групи. Менші скупчення ми приховуємо заради приватності.",
    empty: "У жодному квадраті ще немає 5 людей. Менші скупчення ми приховуємо заради приватності.",
  },
  legend: {
    title: "Люди у квадраті 2 × 2 км",
    low: "5–9 осіб",
    medium: "10–24 особи",
    high: "25 і більше осіб",
    hidden: "Квадрати, у яких живе менше ніж 5 людей, ми приховуємо. Вони виглядають так само, як порожні.",
  },
  zoom: {
    in: "Наблизити",
    out: "Віддалити",
  },
};

export const map: Record<Locale, MapMessages> = { pl, en, uk };

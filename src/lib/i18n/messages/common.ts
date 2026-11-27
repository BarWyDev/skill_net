// Messages every page shows: the header, the footer, the language switcher and the default page
// title, description and share-image alt text. Polish is the shape; `en` and `uk` are typed as it,
// so a missing or extra key fails `astro check`. Relative imports only, so `node:test` loads it.
//
// The Ukrainian text waits for a native reader before production offers it (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";

export const pl = {
  nav: {
    /** The accessible name of the header's navigation. */
    label: "Główna",
    coordinator: "Koordynator",
    map: "Mapa",
    courses: "Kursy",
    profile: "Mój profil",
    signOut: "Wyloguj",
    signIn: "Zaloguj się",
    signUp: "Załóż konto",
  },
  breadcrumb: {
    /** The accessible name of the breadcrumb trail (PageShell). */
    label: "Ścieżka",
  },
  footer: {
    privacy: "Prywatność i przetwarzanie danych",
  },
  languageSwitch: {
    /** The accessible name of the switcher's navigation. */
    label: "Język",
  },
  meta: {
    title: "SkillNet",
    description: "Lokalny katalog umiejętności na czas kryzysu i na co dzień: sąsiedzi, którzy mogą pomóc w okolicy.",
    ogImageAlt: "SkillNet: lokalny katalog umiejętności na czas kryzysu. Ciemne tło i siatka kwadratów mapy.",
  },
};

export type CommonMessages = typeof pl;

export const en: CommonMessages = {
  nav: {
    label: "Main",
    coordinator: "Coordinator",
    map: "Map",
    courses: "Courses",
    profile: "My profile",
    signOut: "Sign out",
    signIn: "Sign in",
    signUp: "Create account",
  },
  breadcrumb: {
    label: "Breadcrumb",
  },
  footer: {
    privacy: "Privacy and data processing",
  },
  languageSwitch: {
    label: "Language",
  },
  meta: {
    title: "SkillNet",
    description: "A local skills directory for a crisis and for every day: neighbours nearby who can help.",
    ogImageAlt: "SkillNet: a local skills directory for a crisis. A dark background and a grid of map squares.",
  },
};

export const uk: CommonMessages = {
  nav: {
    label: "Головна",
    coordinator: "Координатор",
    map: "Мапа",
    courses: "Курси",
    profile: "Мій профіль",
    signOut: "Вийти",
    signIn: "Увійти",
    signUp: "Створити акаунт",
  },
  breadcrumb: {
    label: "Шлях",
  },
  footer: {
    privacy: "Приватність і обробка даних",
  },
  languageSwitch: {
    label: "Мова",
  },
  meta: {
    title: "SkillNet",
    description: "Місцевий каталог умінь на час кризи й на щодень: сусіди поблизу, які можуть допомогти.",
    ogImageAlt: "SkillNet: місцевий каталог умінь на час кризи. Темне тло і сітка квадратів мапи.",
  },
};

export const common: Record<Locale, CommonMessages> = { pl, en, uk };

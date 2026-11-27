// The landing page. Polish is the shape; `en` and `uk` are typed as it. Relative imports only, so
// `node:test` loads it. The header's own links (sign in, create account, my profile) come from
// `common`. The Ukrainian text waits for a native reader (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";

export const pl = {
  /** The headline, split by meaning: each line rises separately, and the last one is accented. */
  headline: {
    first: "Lokalny katalog",
    second: "umiejętności",
    accent: "na czas kryzysu",
  },
  lead: "Gdy brakuje prądu, wody albo rąk do pracy, koordynator gminy szybko znajduje sąsiadów, którzy mogą pomóc. Na co dzień ci sami ludzie pomagają sobie w okolicy.",
  seeMap: "Zobacz mapę umiejętności",
  howItWorks: "Jak to działa",
  points: {
    skills: {
      title: "Dodaj swoje umiejętności",
      body: "Ratownictwo, elektryka, języki, sprzęt. Zaznacz, w czym możesz pomóc i kiedy masz na to czas.",
    },
    location: {
      title: "Twoja lokalizacja jest chroniona",
      body: "Zapisujemy tylko przybliżony obszar, około 500 m. Publiczna mapa pokazuje dla kwadratów 2 km wyłącznie przedziały liczby osób.",
    },
    help: {
      title: "Pomoc, gdy jest potrzebna",
      body: "W kryzysie koordynator gminy znajduje najbliższe osoby z potrzebnymi umiejętnościami i prosi je o pomoc.",
    },
  },
  accountDeleted: "Twoje konto i dane zostały usunięte.",
};

export type LandingMessages = typeof pl;

export const en: LandingMessages = {
  headline: {
    first: "Local skills",
    second: "directory",
    accent: "for a crisis",
  },
  lead: "When power, water or helping hands run short, the municipal coordinator quickly finds neighbours who can help. Day to day, the same people help each other locally.",
  seeMap: "See the skills map",
  howItWorks: "How it works",
  points: {
    skills: {
      title: "Add your skills",
      body: "Rescue, electrical work, languages, equipment. Mark what you can help with and when you have time for it.",
    },
    location: {
      title: "Your location is protected",
      body: "We store only an approximate area, about 500 m. For 2 km squares, the public map shows only ranges of the number of people.",
    },
    help: {
      title: "Help when it is needed",
      body: "In a crisis the municipal coordinator finds the nearest people with the skills needed and asks them for help.",
    },
  },
  accountDeleted: "Your account and data have been deleted.",
};

export const uk: LandingMessages = {
  headline: {
    first: "Місцевий",
    second: "каталог умінь",
    accent: "на час кризи",
  },
  lead: "Коли бракує світла, води або рук до роботи, координатор гміни швидко знаходить сусідів, які можуть допомогти. А щодня ці самі люди допомагають одне одному по сусідству.",
  seeMap: "Переглянути мапу умінь",
  howItWorks: "Як це працює",
  points: {
    skills: {
      title: "Додайте свої вміння",
      body: "Рятувальна справа, електрика, мови, спорядження. Позначте, чим можете допомогти і коли маєте на це час.",
    },
    location: {
      title: "Ваше місцезнаходження захищене",
      body: "Ми зберігаємо лише приблизну ділянку, близько 500 м. Публічна мапа показує для квадратів 2 км лише діапазони кількості людей.",
    },
    help: {
      title: "Допомога, коли вона потрібна",
      body: "Під час кризи координатор гміни знаходить найближчих людей із потрібними вміннями і просить їх про допомогу.",
    },
  },
  accountDeleted: "Ваш акаунт і дані видалено.",
};

export const landing: Record<Locale, LandingMessages> = { pl, en, uk };

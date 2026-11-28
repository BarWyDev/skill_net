// The error pages: 404, access denied (403) and too many attempts (429). Polish is the shape; `en`
// and `uk` are typed as it. Relative imports only, so `node:test` loads it. The smoke test asserts
// the Polish headings "Nie znaleziono strony", "Brak dostępu" and "Zbyt wiele prób": keep them.
// The Ukrainian text waits for a native reader (Open Roadmap Question 13).

import type { Locale } from "../locale.ts";

export const pl = {
  notFound: {
    title: "Nie znaleziono strony — SkillNet",
    heading: "Nie znaleziono strony",
    body: "Pod tym adresem nic nie ma. Link mógł się zmienić albo zawierać literówkę.",
    home: "Strona główna",
    map: "Mapa umiejętności",
  },
  accessDenied: {
    title: "Brak dostępu — SkillNet",
    heading: "Brak dostępu",
    body: "Ta część serwisu jest dostępna tylko dla koordynatorów wyznaczonych przez operatora.",
    backToProfile: "Wróć do profilu",
    backHome: "Wróć na stronę główną",
  },
  tooManyAttempts: {
    title: "Zbyt wiele prób — SkillNet",
    heading: "Zbyt wiele prób",
    body: "Z tego adresu albo dla tego konta było w ostatniej minucie zbyt wiele prób. Odczekaj minutę i spróbuj ponownie.",
    backToSignIn: "Wróć do logowania",
  },
};

export type ErrorMessages = typeof pl;

export const en: ErrorMessages = {
  notFound: {
    title: "Page not found — SkillNet",
    heading: "Page not found",
    body: "There is nothing at this address. The link may have changed or contain a typo.",
    home: "Home page",
    map: "Skills map",
  },
  accessDenied: {
    title: "No access — SkillNet",
    heading: "No access",
    body: "This part of the service is available only to coordinators appointed by the operator.",
    backToProfile: "Back to your profile",
    backHome: "Back to the home page",
  },
  tooManyAttempts: {
    title: "Too many attempts — SkillNet",
    heading: "Too many attempts",
    body: "There were too many attempts from this address or for this account in the last minute. Wait a minute and try again.",
    backToSignIn: "Back to sign-in",
  },
};

export const uk: ErrorMessages = {
  notFound: {
    title: "Сторінку не знайдено — SkillNet",
    heading: "Сторінку не знайдено",
    body: "За цією адресою нічого немає. Посилання могло змінитися або містити помилку.",
    home: "Головна сторінка",
    map: "Мапа умінь",
  },
  accessDenied: {
    title: "Немає доступу — SkillNet",
    heading: "Немає доступу",
    body: "Ця частина сервісу доступна лише координаторам, яких призначив оператор.",
    backToProfile: "Повернутися до профілю",
    backHome: "Повернутися на головну сторінку",
  },
  tooManyAttempts: {
    title: "Забагато спроб — SkillNet",
    heading: "Забагато спроб",
    body: "З цієї адреси або для цього акаунта за останню хвилину було забагато спроб. Зачекайте хвилину і спробуйте ще раз.",
    backToSignIn: "Повернутися до входу",
  },
};

export const errors: Record<Locale, ErrorMessages> = { pl, en, uk };

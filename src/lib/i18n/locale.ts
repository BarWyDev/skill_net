// The interface languages and how a request gets one (roadmap S-18, FR-021). The single place that
// names the supported languages. Pure functions and relative imports only, so `node:test` loads it.

export const LOCALES = ["pl", "en", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

/** The language of a request that names none, and the one an environment can never switch off. */
export const DEFAULT_LOCALE: Locale = "pl";
/** The language of a visitor whose browser asks only for languages the site does not have. */
const FOREIGN_VISITOR_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "skillnet_lang";
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** `?lang=pl|en|uk` on any page sets the language, then redirects to the address without it. */
export const LANG_PARAM = "lang";

/** Each language's own name: the accessible name of its entry in the switcher. Never translated. */
export const LOCALE_NAMES: Record<Locale, string> = {
  pl: "Polski",
  en: "English",
  uk: "Українська",
};
/** What the switcher shows. Ukrainian is "UA" (the country code people look for), not the tag "uk". */
export const LOCALE_LABELS: Record<Locale, string> = { pl: "PL", en: "EN", uk: "UA" };
/** For `og:locale`. */
export const OG_LOCALES: Record<Locale, string> = { pl: "pl_PL", en: "en_GB", uk: "uk_UA" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The languages an environment offers, from its `ENABLED_LOCALES` (comma-separated). Fails closed:
 * unknown entries are ignored, and an unset or unparsable value means Polish only. Polish is always
 * in the list. The result follows the order of `LOCALES`, which is the order of the switcher.
 */
export function parseEnabledLocales(raw: string | undefined): Locale[] {
  const named = new Set(
    (typeof raw === "string" ? raw : "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(isLocale),
  );
  return LOCALES.filter((locale) => locale === DEFAULT_LOCALE || named.has(locale));
}

// A header longer than this is cut: no browser sends one, and parsing stays cheap on the Worker.
const MAX_HEADER_LENGTH = 1000;
const LANGUAGE_TAG = /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/;
const QUALITY = /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/;

interface Preference {
  /** The primary subtag, lower case: "uk" for "uk-UA". */
  language: string;
  quality: number;
}

/**
 * The languages an `Accept-Language` header names, in the header's order. `*` and anything that is
 * not a language tag are left out. A quality that cannot be read counts as 1, like a missing one.
 */
function parseAcceptLanguage(header: string): Preference[] {
  const preferences: Preference[] = [];
  for (const entry of header.slice(0, MAX_HEADER_LENGTH).split(",")) {
    const [rawTag = "", ...params] = entry.split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!LANGUAGE_TAG.test(tag)) continue;
    let quality = 1;
    for (const param of params) {
      const [name = "", value = ""] = param.split("=");
      if (name.trim().toLowerCase() === "q" && QUALITY.test(value.trim())) quality = Number(value.trim());
    }
    preferences.push({ language: tag.split("-")[0] ?? tag, quality });
  }
  return preferences;
}

export interface LocaleInputs {
  /** The value of the language cookie, if the request carries one. */
  cookie: string | undefined | null;
  /** The request's `Accept-Language` header. */
  acceptLanguage: string | undefined | null;
  /** From `parseEnabledLocales`. */
  enabled: readonly Locale[];
}

/**
 * The language of a request:
 *
 * 1. the cookie, when it names an enabled language;
 * 2. otherwise the first enabled language in `Accept-Language`, by descending quality. Entries with
 *    `q=0` are dropped ("never this language") and equal qualities keep the header's order;
 * 3. Polish when the header is missing, empty or only `*` (robots, the smoke test);
 * 4. English, when enabled, for a header that names only languages the site does not have.
 */
export function resolveLocale({ cookie, acceptLanguage, enabled }: LocaleInputs): Locale {
  const offered = (locale: unknown): locale is Locale => isLocale(locale) && enabled.includes(locale);
  if (offered(cookie)) return cookie;

  const named = parseAcceptLanguage(acceptLanguage ?? "");
  if (named.length === 0) return DEFAULT_LOCALE;

  // Array.prototype.sort is stable, so equal qualities stay in the header's order.
  const wanted = named.filter((preference) => preference.quality > 0).sort((a, b) => b.quality - a.quality);
  for (const { language } of wanted) {
    if (offered(language)) return language;
  }
  return offered(FOREIGN_VISITOR_LOCALE) ? FOREIGN_VISITOR_LOCALE : DEFAULT_LOCALE;
}

/** The language a `?lang=` link asks for, or null when the value is not an enabled language. */
export function requestedLocale(url: URL, enabled: readonly Locale[]): Locale | null {
  const value = url.searchParams.get(LANG_PARAM);
  return isLocale(value) && enabled.includes(value) ? value : null;
}

/**
 * Where a request with `?lang=` is redirected: the same address without the parameter, or null when
 * the address has none. Always an absolute URL on the request's own origin, never a path string: a
 * request to `//evil.example?lang=en` has the path `//evil.example`, which a browser would read as
 * another host in a relative `Location` (the class fixed in return-path.ts, security audit F-01).
 */
export function langRedirectTarget(url: URL): string | null {
  if (!url.searchParams.has(LANG_PARAM)) return null;
  const target = new URL(url.href);
  target.searchParams.delete(LANG_PARAM);
  target.hash = "";
  return target.href;
}

/**
 * The switcher's link to the current page in another language. Only a query string: the browser
 * resolves it against the address it shows, so a path that starts with `//` cannot leave the site.
 */
export function langSwitchHref(url: URL, locale: Locale): string {
  const params = new URLSearchParams(url.search);
  params.set(LANG_PARAM, locale);
  return `?${params.toString()}`;
}

// Filling a catalogue message: `{name}` placeholders and plural forms. Relative imports only, so
// `node:test` loads it.

import type { Locale } from "./locale.ts";

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replaces each `{name}` with its value. A placeholder with no value is left as it is. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

/** The placeholder names a message uses, sorted and without repeats. */
export function placeholders(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]))].sort();
}

/**
 * The forms of one countable phrase. Polish and Ukrainian need `one` (1), `few` (2–4, 22–24, …) and
 * `many` (0, 5–21, …); English needs `one` and `other`. `other` is required: it is the fallback for
 * a form a language leaves out, and what fractions use.
 */
export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

const rules = new Map<Locale, Intl.PluralRules>();

/** Picks the form for `count` by the language's plural rule. */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  const category = rule.select(count);
  return (category === "one" || category === "few" || category === "many" ? forms[category] : undefined) ?? forms.other;
}

const DATE_TAGS: Record<Locale, string> = { pl: "pl-PL", en: "en-GB", uk: "uk-UA" };

const longDates = new Map<Locale, Intl.DateTimeFormat>();
const dateTimes = new Map<Locale, Intl.DateTimeFormat>();

/**
 * A calendar day (`YYYY-MM-DD`) in the language's own form: `15.10.2026` in Polish and Ukrainian,
 * `15 October 2026` in English. No time zone is involved, so the day never shifts.
 */
export function formatDate(locale: Locale, date: string): string {
  const [year, month, day] = date.split("-");
  if (locale !== "en") return `${day}.${month}.${year}`;
  let formatter = longDates.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DATE_TAGS[locale], { dateStyle: "long", timeZone: "UTC" });
    longDates.set(locale, formatter);
  }
  return formatter.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

/** A moment (ISO timestamp) as a short date and time on the Europe/Warsaw clock. */
export function formatDateTime(locale: Locale, iso: string): string {
  let formatter = dateTimes.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DATE_TAGS[locale], {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Warsaw",
    });
    dateTimes.set(locale, formatter);
  }
  return formatter.format(new Date(iso));
}

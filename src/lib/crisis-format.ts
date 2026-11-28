// Display formatting shared by the coordinator panel and the crisis pages, in the request's language
// (the words live in the `crisis` catalogue). Relative imports only, so `node:test` can load it.

import { ALL_SLOTS_MASK, DAYS, daySlots, SLOTS_PER_DAY } from "./availability.ts";
import { format, formatDateTime, plural } from "./i18n/format.ts";
import type { Locale } from "./i18n/locale.ts";
import { crisis as crisisMessages } from "./i18n/messages/crisis.ts";
import { profile } from "./i18n/messages/profile.ts";
import type { StatusTone } from "./site-styles";

const NUMBER_TAGS: Record<Locale, string> = { pl: "pl-PL", en: "en-GB", uk: "uk-UA" };
const kmFormats = new Map<Locale, Intl.NumberFormat>();

/** A moment as a short date and time on the Europe/Warsaw clock. */
export function formatActivatedAt(locale: Locale, iso: string): string {
  return formatDateTime(locale, iso);
}

/** A distance already rounded to 0.5 km, with one decimal; zero reads "< 0,5 km". */
export function formatDistanceKm(locale: Locale, km: number): string {
  const t = crisisMessages[locale].format;
  if (km === 0) return t.underHalfKm;
  let number = kmFormats.get(locale);
  if (!number) {
    number = new Intl.NumberFormat(NUMBER_TAGS[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    kmFormats.set(locale, number);
  }
  return format(t.km, { km: number.format(km) });
}

/** "1 osoba", "2 osoby", "5 osób". */
export function formatPeople(locale: Locale, n: number): string {
  return format(plural(locale, n, crisisMessages[locale].format.people), { count: n });
}

/** The word after `formatPeople`: "1 osoba dopasowana", "2 osoby dopasowane", "5 osób dopasowanych". */
export function matchedWord(locale: Locale, n: number): string {
  return plural(locale, n, crisisMessages[locale].format.matched);
}

/** "5 km" or "5 km, okolice 31-001": a crisis's or an exercise's area as one phrase. */
export function formatArea(locale: Locale, radiusKm: number, postcode: string | null): string {
  const t = crisisMessages[locale].format;
  const km = format(t.km, { km: radiusKm });
  return postcode ? `${km}, ${format(t.place, { postcode })}` : km;
}

/** "Awaria prądu · 5 km · okolice 31-001": tells apart crises of the same type and radius. */
export function formatCrisisTitle(
  locale: Locale,
  crisis: { typeName: string; radiusKm: number; epicentrePostcode: string | null },
): string {
  const t = crisisMessages[locale].format;
  const place = crisis.epicentrePostcode ? ` · ${format(t.place, { postcode: crisis.epicentrePostcode })}` : "";
  return `${crisis.typeName} · ${format(t.km, { km: crisis.radiusKm })}${place}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "aktywny od 25 min", "aktywny od 3 godz.", "aktywny od 1 dnia", "aktywny od 2 dni". */
export function formatActiveFor(locale: Locale, activatedAtIso: string, now: Date = new Date()): string {
  const t = crisisMessages[locale].format.activeFor;
  const elapsed = Math.max(0, now.getTime() - new Date(activatedAtIso).getTime());
  if (elapsed < MINUTE_MS) return t.justNow;
  if (elapsed < HOUR_MS) return format(t.minutes, { count: Math.floor(elapsed / MINUTE_MS) });
  if (elapsed < DAY_MS) return format(t.hours, { count: Math.floor(elapsed / HOUR_MS) });
  const days = Math.floor(elapsed / DAY_MS);
  return format(plural(locale, days, t.days), { count: days });
}

/** A resident's declared availability at the time of viewing, as a status from the shared vocabulary. */
export function availabilityStatus(locale: Locale, availableNow: boolean | null): { label: string; tone: StatusTone } {
  const t = crisisMessages[locale].availability;
  if (availableNow === true) return { label: t.now, tone: "done" };
  if (availableNow === false) return { label: t.notNow, tone: "neutral" };
  return { label: t.unknown, tone: "neutral" };
}

/**
 * A compact summary of declared availability such as "pn–pt: wieczór; sb–nd: cały dzień", with the
 * day and slot names of the profile's availability grid. Consecutive days with the same slots are
 * grouped, days without slots are left out. "zawsze" for every slot, "" for not declared.
 */
export function formatAvailabilitySummary(locale: Locale, mask: number | null): string {
  if (!mask) return "";
  const t = crisisMessages[locale].availability;
  if (mask === ALL_SLOTS_MASK) return t.always;

  const { dayLabels, slotNames } = profile[locale].availability;
  const fullDay = (1 << SLOTS_PER_DAY) - 1;
  const groups: string[] = [];
  let start = 0;
  while (start < DAYS) {
    const slots = daySlots(mask, start);
    let end = start;
    while (end + 1 < DAYS && daySlots(mask, end + 1) === slots) end++;
    if (slots !== 0) {
      const days = start === end ? dayLabels[start] : `${dayLabels[start]}–${dayLabels[end]}`;
      const names = slots === fullDay ? t.wholeDay : slotNames.filter((_, slot) => (slots >> slot) & 1).join(", ");
      groups.push(`${days}: ${names}`);
    }
    start = end + 1;
  }
  return groups.join("; ");
}

/** True once a crisis has been active for more than 24 hours: it may have been forgotten. */
export function isStale(activatedAtIso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(activatedAtIso).getTime() > DAY_MS;
}

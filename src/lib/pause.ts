// Pause date rules (roadmap S-13). The database checks the same bounds in `profiles_check_pause`:
// from Warsaw today to Warsaw today + 365 days. Both ends are computed on the server, so a
// browser in another time zone never sees a different "today" from the database.

/** The latest end date a pause may have, in days after Warsaw today. */
export const PAUSE_MAX_DAYS = 365;

const WARSAW_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date on the Europe/Warsaw calendar, as `YYYY-MM-DD`. */
export function warsawToday(now: Date): string {
  const parts = Object.fromEntries(WARSAW_DATE.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** `YYYY-MM-DD` plus `days` calendar days, like `date + integer` in Postgres. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The `min` and `max` for the pause date field: Warsaw today and today + 365 days. */
export function pauseDateBounds(now: Date): { min: string; max: string } {
  const min = warsawToday(now);
  return { min, max: addDays(min, PAUSE_MAX_DAYS) };
}

/** `YYYY-MM-DD` as `DD.MM.YYYY`. */
export function formatPauseUntil(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

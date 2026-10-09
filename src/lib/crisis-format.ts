// Display formatting shared by the coordinator panel and the crisis page (Polish locale).

const DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});

const KM = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatActivatedAt(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** A distance already rounded to 0.5 km; zero reads "< 0,5 km". */
export function formatDistanceKm(km: number): string {
  return km === 0 ? "< 0,5 km" : `${KM.format(km)} km`;
}

/** "1 osoba", "2 osoby", "5 osób". */
export function formatPeople(n: number): string {
  if (n === 1) return "1 osoba";
  const lastTwo = n % 100;
  const last = n % 10;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${n} ${few ? "osoby" : "osób"}`;
}

/** The adjective after `formatPeople`: "1 osoba dopasowana", "2 osoby dopasowane", "5 osób dopasowanych". */
export function matchedWord(n: number): string {
  if (n === 1) return "dopasowana";
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "dopasowane" : "dopasowanych";
}

/** "Awaria prądu · 5 km · okolice 31-001": tells apart crises of the same type and radius. */
export function formatCrisisTitle(crisis: { typeName: string; radiusKm: number; epicentrePostcode: string | null }) {
  const place = crisis.epicentrePostcode ? ` · okolice ${crisis.epicentrePostcode}` : "";
  return `${crisis.typeName} · ${crisis.radiusKm} km${place}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "aktywny od 25 min", "aktywny od 3 godz.", "aktywny od 1 dnia", "aktywny od 2 dni". */
export function formatActiveFor(activatedAtIso: string, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(activatedAtIso).getTime());
  if (elapsed < MINUTE_MS) return "aktywny od chwili";
  if (elapsed < HOUR_MS) return `aktywny od ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `aktywny od ${Math.floor(elapsed / HOUR_MS)} godz.`;
  const days = Math.floor(elapsed / DAY_MS);
  return `aktywny od ${days} ${days === 1 ? "dnia" : "dni"}`;
}

/** The badge for a resident's declared availability at the time of viewing. */
export function availabilityBadge(availableNow: boolean | null): { label: string; className: string } {
  if (availableNow === true) {
    return {
      label: "Deklaruje dostępność teraz",
      className: "border-emerald-300/60 bg-emerald-500/25 text-emerald-50",
    };
  }
  if (availableNow === false) {
    return { label: "Teraz poza deklarowaną dostępnością", className: "border-white/25 bg-white/10 text-blue-100" };
  }
  return { label: "Nie podano", className: "border-white/10 bg-transparent text-blue-100/60" };
}

/** True once a crisis has been active for more than 24 hours: it may have been forgotten. */
export function isStale(activatedAtIso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(activatedAtIso).getTime() > DAY_MS;
}

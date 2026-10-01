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

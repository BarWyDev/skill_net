// The summary above a crisis's skill coverage. Relative imports only, so `node:test` can load it.

import type { Locale } from "./i18n/locale.ts";
import type { CrisisCoverageDTO } from "../types";

export interface CoverageSummary {
  priorityTotal: number;
  priorityCovered: number;
  /** Names of the priority skills nobody on the list has, in matrix order. */
  missingPriority: string[];
  /** Names of the supporting skills nobody on the list has, in matrix order. */
  missingSupporting: string[];
}

export function summariseCoverage(rows: Pick<CrisisCoverageDTO, "name" | "tier" | "people">[]): CoverageSummary {
  const priority = rows.filter((r) => r.tier === "priority");
  const missing = (tier: CrisisCoverageDTO["tier"]) =>
    rows.filter((r) => r.tier === tier && r.people === 0).map((r) => r.name);
  return {
    priorityTotal: priority.length,
    priorityCovered: priority.filter((r) => r.people > 0).length,
    missingPriority: missing("priority"),
    missingSupporting: missing("supporting"),
  };
}

// British English has no comma before the final "and".
const LIST_TAGS: Record<Locale, string> = { pl: "pl-PL", en: "en-GB", uk: "uk-UA" };
const lists = new Map<Locale, Intl.ListFormat>();

/** "Brak: sternik, łódź." style list: the names joined with commas and the language's final "and". */
export function joinNames(locale: Locale, names: string[]): string {
  let list = lists.get(locale);
  if (!list) {
    list = new Intl.ListFormat(LIST_TAGS[locale], { type: "conjunction" });
    lists.set(locale, list);
  }
  return list.format(names);
}

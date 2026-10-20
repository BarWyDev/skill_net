// The summary above a crisis's skill coverage. Relative imports only, so `node:test` can load it.

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

/** "Brak: sternik, łódź." style list: the names joined with commas and a final "i". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
}

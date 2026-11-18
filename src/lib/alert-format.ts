// Polish text for alert batches on the coordinator's crisis page (S-07). Counts only: nothing here
// names a resident. Relative imports only, so `node:test` can load it.

import type { AlertAnswer, AlertSkipReason, AlertSkips, AlertStatus, CrisisAlertBatchDTO } from "../types.ts";
import type { StatusTone } from "./site-styles.ts";

export const ALERT_COUNT_DEFAULT = 50;
export const ALERT_COUNT_MAX = 200;

// In the order the coordinator can act on them: first what residents can fix themselves.
const SKIP_REASONS: [reason: AlertSkipReason, label: string][] = [
  ["unverified", "bez potwierdzonego numeru"],
  ["no_phone", "bez telefonu"],
  ["paused", "z wstrzymaną dostępnością"],
  ["hidden", "z ukrytymi umiejętnościami"],
  ["other_crisis", "w innym zdarzeniu"],
];

const PLN = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "5 bez potwierdzonego numeru, 3 w innym zdarzeniu", or null when nobody was skipped. */
export function formatSkips(skipped: AlertSkips): string | null {
  const parts = SKIP_REASONS.flatMap(([reason, label]) => {
    const n = skipped[reason] ?? 0;
    return n > 0 ? [`${n} ${label}`] : [];
  });
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "ok. 7,14 zł". An estimate from the price list's upper end; the provider's invoice is the truth. */
export function formatCost(pln: number): string {
  return `ok. ${PLN.format(pln)} zł`;
}

/** One sentence per batch: what was queued (or would have been, in an exercise) and who was skipped. */
export function batchSummary(
  batch: Pick<CrisisAlertBatchDTO, "queued" | "skipped" | "simulated" | "estimatedCostPln">,
): string {
  const skips = formatSkips(batch.skipped);
  const skipped = skips ? ` Pominięto: ${skips}.` : "";

  if (batch.simulated) {
    // Genitive after "do": "do 1 osoby", "do 2 osób", "do 42 osób".
    const who = batch.queued === 0 ? "do nikogo" : batch.queued === 1 ? "do 1 osoby" : `do ${batch.queued} osób`;
    const cost = batch.queued === 0 ? "" : ` (${formatCost(batch.estimatedCostPln)})`;
    return `Ćwiczenie: alert trafiłby ${who}${cost}. Nikt nie dostał SMS-a.${skipped}`;
  }
  if (batch.queued === 0) {
    return `Nikt nie dostał alertu: na liście nie ma kolejnych osób, do których można go wysłać.${skipped}`;
  }
  return `Wysłano do kolejki: ${batch.queued} (${formatCost(batch.estimatedCostPln)}).${skipped}`;
}

const STATUS_LABELS: [status: AlertStatus, label: string][] = [
  ["queued", "w kolejce"],
  ["sent", "wysłano"],
  ["delivered", "dostarczono"],
  ["undelivered", "nie doręczono"],
  ["failed", "nie wysłano"],
];

/** "w kolejce: 3, wysłano: 39", or null when the crisis has no alerts. */
export function formatStatuses(statuses: Partial<Record<AlertStatus, number>>): string | null {
  const parts = STATUS_LABELS.flatMap(([status, label]) => {
    const n = statuses[status] ?? 0;
    return n > 0 ? [`${label}: ${n}`] : [];
  });
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "TAK: 12, NIE: 3", or null when nobody answered yet. */
export function formatAnswers(answers: Partial<Record<AlertAnswer, number>>): string | null {
  const parts = [
    ...((answers.yes ?? 0) > 0 ? [`TAK: ${answers.yes}`] : []),
    ...((answers.no ?? 0) > 0 ? [`NIE: ${answers.no}`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : null;
}

const PERSON_ALERT: Record<AlertStatus, { label: string; tone: StatusTone }> = {
  queued: { label: "Alert: w kolejce", tone: "neutral" },
  sent: { label: "Alert: wysłano", tone: "neutral" },
  delivered: { label: "Alert: dostarczono", tone: "neutral" },
  undelivered: { label: "Alert: nie doręczono", tone: "attention" },
  failed: { label: "Alert: nie wysłano", tone: "attention" },
};

/**
 * One person's alert on the ranked list: the answer when there is one, otherwise where the SMS
 * is. Null when no alert was sent to them.
 */
export function personAlertStatus(
  alertStatus: AlertStatus | null,
  answer: AlertAnswer | null,
): { label: string; tone: StatusTone } | null {
  if (answer === "yes") return { label: "Odpowiedź: TAK", tone: "done" };
  if (answer === "no") return { label: "Odpowiedź: NIE", tone: "attention" };
  return alertStatus ? PERSON_ALERT[alertStatus] : null;
}

/**
 * How many alerts never reached anyone ("nie doręczono" and "nie wysłano"), when that is at least
 * a quarter of all alerts of the crisis: the coordinator should then consider calling instead.
 * Null below that.
 */
export function undeliveredShare(
  statuses: Partial<Record<AlertStatus, number>>,
): { undelivered: number; total: number } | null {
  const total = Object.values(statuses).reduce((sum, n) => sum + n, 0);
  const undelivered = (statuses.undelivered ?? 0) + (statuses.failed ?? 0);
  return undelivered > 0 && undelivered * 4 >= total ? { undelivered, total } : null;
}

/** Reads the N field of the alert form: an integer from 1 to 200, or null. */
export function parseAlertCount(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= ALERT_COUNT_MAX ? n : null;
}

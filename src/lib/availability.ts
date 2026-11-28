// Declared weekly availability. Information for the coordinator only: it never affects the ranking.
//
// Encoding (mirrored in supabase/migrations/20261003120000_resident_phone_and_availability.sql):
// a 28-bit mask, bit index = dayIndex * 4 + slotIndex, where dayIndex 0 is Monday (isodow - 1) and
// slotIndex = floor(hour / 6) on the Europe/Warsaw clock. Slots are noc 0–6, rano 6–12,
// popołudnie 12–18, wieczór 18–24; a slot includes its start and excludes its end. Monday noc is
// bit 0, Sunday wieczór is bit 27. `null` means "not declared"; 0 is never stored.

// Day and slot names are in the `profile` catalogue, in every language.
export const SLOT_HOURS = ["0–6", "6–12", "12–18", "18–24"] as const;

export const DAYS = 7;
export const SLOTS_PER_DAY = SLOT_HOURS.length;
export const SLOT_COUNT = DAYS * SLOTS_PER_DAY;
export const ALL_SLOTS_MASK = 2 ** SLOT_COUNT - 1;

export function slotBit(dayIndex: number, slotIndex: number): number {
  return dayIndex * SLOTS_PER_DAY + slotIndex;
}

/** The set bit indexes of a mask, ascending. */
export function maskToSlots(mask: number | null): number[] {
  if (mask === null) return [];
  const slots: number[] = [];
  for (let bit = 0; bit < SLOT_COUNT; bit++) {
    if ((mask >> bit) & 1) slots.push(bit);
  }
  return slots;
}

/** Folds bit indexes into a mask; duplicates are harmless. Empty gives 0. */
export function slotsToMask(slots: Iterable<number>): number {
  let mask = 0;
  for (const bit of slots) mask |= 1 << bit;
  return mask;
}

/** The four slot bits of one day, slot 0 lowest. */
export function daySlots(mask: number, dayIndex: number): number {
  return (mask >> (dayIndex * SLOTS_PER_DAY)) & ((1 << SLOTS_PER_DAY) - 1);
}

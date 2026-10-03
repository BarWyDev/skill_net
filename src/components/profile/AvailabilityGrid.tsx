import { useState } from "react";
import { ALL_SLOTS_MASK, DAY_LABELS, DAY_NAMES, SLOT_HOURS, SLOT_NAMES, slotBit, slotLabel } from "@/lib/availability";
import { cn } from "@/lib/utils";

interface Props {
  /** Stored mask; null = not declared. */
  initial: number | null;
}

/** Days are rows and slots are columns, so the grid fits a 375 px screen without page scroll. */
export function AvailabilityGrid({ initial }: Props) {
  const [mask, setMask] = useState(initial ?? 0);

  function toggle(bit: number, checked: boolean) {
    setMask((prev) => (checked ? prev | (1 << bit) : prev & ~(1 << bit)));
  }

  const buttonClass =
    "min-h-11 rounded-lg border border-white/20 bg-white/5 px-4 text-sm text-white transition-colors hover:bg-white/10";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setMask(ALL_SLOTS_MASK);
          }}
        >
          Zawsze / o każdej porze
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setMask(0);
          }}
        >
          Wyczyść
        </button>
      </div>

      <div className="overflow-x-auto">
        <div
          role="group"
          aria-label="Tygodniowa dostępność"
          className="grid min-w-72 grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] gap-1"
        >
          <span aria-hidden="true" />
          {SLOT_NAMES.map((name, slot) => (
            <span key={name} aria-hidden="true" className="text-center text-xs leading-tight text-blue-100/80">
              {name}
              <br />
              <span className="text-blue-100/50">{SLOT_HOURS[slot]}</span>
            </span>
          ))}

          {DAY_LABELS.map((day, dayIndex) => (
            <div key={day} className="contents">
              <span aria-hidden="true" className="flex items-center text-sm font-medium text-blue-100">
                {day}
              </span>
              {SLOT_NAMES.map((name, slot) => {
                const bit = slotBit(dayIndex, slot);
                const checked = ((mask >> bit) & 1) === 1;
                return (
                  <label key={name} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="availability"
                      value={bit}
                      checked={checked}
                      aria-label={`${DAY_NAMES[dayIndex]}, ${slotLabel(slot)}`}
                      onChange={(e) => {
                        toggle(bit, e.target.checked);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-11 items-center justify-center rounded-md border text-base transition-colors",
                        "peer-focus-visible:ring-2 peer-focus-visible:ring-purple-300",
                        checked
                          ? "border-purple-400 bg-purple-600 text-white"
                          : "border-white/15 bg-white/5 text-transparent hover:bg-white/10",
                      )}
                    >
                      ✓
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

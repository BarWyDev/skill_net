import { useState } from "react";
import { ALL_SLOTS_MASK, SLOT_HOURS, slotBit } from "@/lib/availability";
import type { Locale } from "@/lib/i18n/locale";
import { profile } from "@/lib/i18n/messages/profile";
import { NAV_LINK } from "@/lib/site-styles";
import { cn } from "@/lib/utils";

interface Props {
  locale: Locale;
  /** Stored mask; null = not declared. */
  initial: number | null;
}

/** Days are rows and slots are columns, so the grid fits a 375 px screen without page scroll. */
export function AvailabilityGrid({ locale, initial }: Props) {
  const t = profile[locale].availability;
  const [mask, setMask] = useState(initial ?? 0);

  function toggle(bit: number, checked: boolean) {
    setMask((prev) => (checked ? prev | (1 << bit) : prev & ~(1 << bit)));
  }

  const shortcut = cn(NAV_LINK, "text-chalk cursor-pointer underline");

  return (
    <div>
      <div className="flex flex-wrap gap-x-6">
        <button
          type="button"
          className={shortcut}
          onClick={() => {
            setMask(ALL_SLOTS_MASK);
          }}
        >
          {t.always}
        </button>
        <button
          type="button"
          className={shortcut}
          onClick={() => {
            setMask(0);
          }}
        >
          {t.clear}
        </button>
      </div>

      {/* Square cells, one per day and time of day, like the map grid. Below 18rem it scrolls here,
          never the page. */}
      <div className="mt-4 overflow-x-auto pb-1">
        <div
          role="group"
          aria-label={t.gridLabel}
          className="grid w-full max-w-[21rem] min-w-[18rem] grid-cols-[2rem_repeat(4,minmax(2.75rem,1fr))] gap-1.5 p-1"
        >
          <span aria-hidden="true" />
          {t.slotNames.map((name, slot) => (
            <span key={name} aria-hidden="true" className="pb-1 text-center text-[0.8125rem] leading-tight">
              {name}
              <br />
              <span className="text-ash tabular-nums">{SLOT_HOURS[slot]}</span>
            </span>
          ))}

          {t.dayLabels.map((day, dayIndex) => (
            <div key={day} className="contents">
              <span aria-hidden="true" className="text-ash flex items-center">
                {day}
              </span>
              {t.slotNames.map((name, slot) => {
                const bit = slotBit(dayIndex, slot);
                const checked = ((mask >> bit) & 1) === 1;
                return (
                  <label key={name} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="availability"
                      value={bit}
                      checked={checked}
                      aria-label={`${t.dayNames[dayIndex]}, ${name} ${SLOT_HOURS[slot]}`}
                      onChange={(e) => {
                        toggle(bit, e.target.checked);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex aspect-square min-h-11 items-center justify-center text-lg font-bold",
                        "peer-focus-visible:outline-signal peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2",
                        checked
                          ? "bg-signal text-graphite"
                          : "shadow-[inset_0_0_0_2px_var(--color-ash)] hover:shadow-[inset_0_0_0_2px_var(--color-chalk)]",
                      )}
                    >
                      {checked && "✓"}
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

import { useState } from "react";
import type React from "react";
import { LocationPicker, locationProblem, type LocationValue } from "@/components/profile/LocationPicker";
import { cn } from "@/lib/utils";
import { DEFAULT_RADIUS, RADIUS_PRESETS } from "@/lib/validation/crisis";
import type { CrisisTypeDTO, RadiusKm } from "@/types";

interface Props {
  crisisTypes: CrisisTypeDTO[];
}

const EMPTY_LOCATION: LocationValue = { source: null, postcode: "", lat: null, lng: null };

export default function CrisisActivationForm({ crisisTypes }: Props) {
  const [crisisType, setCrisisType] = useState("");
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [submitting, setSubmitting] = useState(false);

  // A postcode counts once the lookup found it; the server resolves the raw centroid itself.
  // A pin abroad is refused here too (QA-024), so the form keeps the type and the pin.
  const locationReady =
    location.source !== null && location.lat !== null && location.lng !== null && locationProblem(location) === null;
  const ready = crisisType !== "" && locationReady;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    // One activation per click: a second submit would create a second crisis.
    if (!ready || submitting) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/koordynator/kryzysy" className="space-y-6" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="crisis_type" className="mb-1 block text-sm text-blue-100">
          Rodzaj kryzysu
        </label>
        <select
          id="crisis_type"
          name="crisis_type"
          value={crisisType}
          onChange={(e) => {
            setCrisisType(e.target.value);
          }}
          className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-white focus:border-purple-400 focus:outline-none sm:w-72"
        >
          <option value="" disabled className="text-black">
            Wybierz…
          </option>
          {crisisTypes.map((t) => (
            <option key={t.slug} value={t.slug} className="text-black">
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby="epicentre-heading" className="space-y-2">
        <h2 id="epicentre-heading" className="text-sm text-blue-100">
          Epicentrum
        </h2>
        <LocationPicker
          value={location}
          initial={EMPTY_LOCATION}
          onChange={setLocation}
          hint="Epicentrum to środek obszaru, w którym szukamy mieszkańców. Zapisujemy je dokładnie, bez zaokrąglania."
        />
      </section>

      <fieldset>
        <legend className="mb-2 text-sm text-blue-100">Promień</legend>
        <div className="flex flex-wrap gap-2">
          {RADIUS_PRESETS.map((km) => (
            <label
              key={km}
              className={cn(
                "flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-purple-400",
                radius === km
                  ? "border-purple-400 bg-purple-600 text-white"
                  : "border-white/20 bg-white/10 text-blue-50 hover:bg-white/20",
              )}
            >
              <input
                type="radio"
                name="radius_km"
                value={km}
                checked={radius === km}
                onChange={() => {
                  setRadius(km);
                }}
                className="sr-only"
              />
              {km} km
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        {!locationReady && <p className="text-sm text-blue-100/70">Wskaż epicentrum, aby aktywować.</p>}
        <button
          type="submit"
          disabled={!ready || submitting}
          className="h-12 w-full rounded-lg bg-red-600 px-6 font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Aktywuję…" : "Aktywuj"}
        </button>
      </div>
    </form>
  );
}

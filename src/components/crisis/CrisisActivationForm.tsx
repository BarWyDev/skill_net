import { useState } from "react";
import type React from "react";
import { LocationPicker, locationProblem, type LocationValue } from "@/components/profile/LocationPicker";
import { BUTTON } from "@/lib/site-styles";
import { cn } from "@/lib/utils";
import { DEFAULT_RADIUS, RADIUS_PRESETS, REASON_MAX, REASON_MIN } from "@/lib/validation/crisis";
import type { CrisisTypeDTO, RadiusKm } from "@/types";

interface Props {
  crisisTypes: CrisisTypeDTO[];
}

const EMPTY_LOCATION: LocationValue = { source: null, postcode: "", lat: null, lng: null };

export default function CrisisActivationForm({ crisisTypes }: Props) {
  const [crisisType, setCrisisType] = useState("");
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A postcode counts once the lookup found it; the server resolves the raw centroid itself.
  // A pin abroad is refused here too (QA-024), so the form keeps the type and the pin.
  const locationReady =
    location.source !== null && location.lat !== null && location.lng !== null && locationProblem(location) === null;
  const reasonLength = reason.trim().length;
  const reasonReady = reasonLength >= REASON_MIN && reasonLength <= REASON_MAX;
  const ready = crisisType !== "" && locationReady && reasonReady;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    // One activation per click: a second submit would create a second crisis.
    if (!ready || submitting) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/koordynator/kryzysy" onSubmit={handleSubmit} noValidate className="mt-8">
      <div className="space-y-10">
        <div>
          <label htmlFor="crisis_type" className="mb-2 block font-bold">
            Rodzaj kryzysu
          </label>
          <select
            id="crisis_type"
            name="crisis_type"
            value={crisisType}
            onChange={(e) => {
              setCrisisType(e.target.value);
            }}
            className="field [&>option]:bg-graphite h-12 w-full cursor-pointer px-3 text-lg scheme-dark sm:w-80"
          >
            <option value="" disabled>
              Wybierz…
            </option>
            {crisisTypes.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <section aria-labelledby="epicentre-heading">
          <h3 id="epicentre-heading" className="mb-1 text-lg font-bold">
            Epicentrum
          </h3>
          <p className="text-ash mb-4 leading-relaxed">Wpisz kod pocztowy albo zaznacz miejsce na mapie.</p>
          <LocationPicker
            value={location}
            initial={EMPTY_LOCATION}
            onChange={setLocation}
            hint="Epicentrum to środek obszaru, w którym szukamy mieszkańców. Zapisujemy je dokładnie, bez zaokrąglania."
          />
        </section>

        <fieldset>
          <legend className="mb-2 font-bold">Promień</legend>
          {/* A row of toggle buttons; each is a native radio, so the group keeps its arrow keys and
              checked state for screen readers. */}
          <div className="flex flex-wrap gap-2">
            {RADIUS_PRESETS.map((km) => (
              <label
                key={km}
                className={cn(
                  "has-focus-visible:outline-signal flex h-12 min-w-20 cursor-pointer items-center justify-center px-4 text-lg tabular-nums has-focus-visible:outline-3 has-focus-visible:outline-offset-3",
                  radius === km
                    ? "bg-signal text-graphite font-bold"
                    : "text-chalk hover:bg-seam shadow-[inset_0_0_0_2px_var(--color-ash)]",
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

        {/* Stored with the crisis and seen by whoever reviews activations (security audit F-02). */}
        <div>
          <label htmlFor="reason" className="mb-2 block font-bold">
            Powód aktywacji
          </label>
          <textarea
            id="reason"
            name="reason"
            required
            minLength={REASON_MIN}
            maxLength={REASON_MAX}
            rows={3}
            autoComplete="off"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            aria-describedby="reason-hint"
            className="field block w-full max-w-[42rem] resize-y px-3 py-3 text-lg leading-relaxed"
            placeholder="np. pożar budynku przy ul. Długiej, potrzebni ratownicy"
          />
          <p id="reason-hint" className="text-ash mt-2 text-[0.9375rem]">
            Od {REASON_MIN} do {REASON_MAX} znaków. Powód zapisujemy razem z kryzysem i Twoim kontem. Jeden koordynator
            może aktywować najwyżej 3 kryzysy na godzinę.
          </p>
        </div>
      </div>

      {/* Consequential, so the one primary action stands apart from the fields, under a hairline. The
          hint keeps its line when empty, so nothing moves when it goes. */}
      <div className="border-seam mt-12 border-t pt-8">
        <p className="text-ash mb-4 min-h-7">
          {!locationReady
            ? "Wskaż epicentrum, aby aktywować."
            : !reasonReady && `Podaj powód (co najmniej ${REASON_MIN} znaków), aby aktywować.`}
        </p>
        <button
          type="submit"
          disabled={!ready || submitting}
          className={cn(
            BUTTON,
            "w-full sm:w-auto sm:min-w-56",
            ready ? "btn-primary cursor-pointer" : "bg-seam text-ash cursor-not-allowed",
            submitting && "cursor-wait",
          )}
        >
          {submitting ? "Aktywuję…" : "Aktywuj kryzys"}
        </button>
      </div>
    </form>
  );
}

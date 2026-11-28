import { useState } from "react";
import type React from "react";
import { LocationPicker, locationProblem, type LocationValue } from "@/components/profile/LocationPicker";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { crisis as crisisMessages } from "@/lib/i18n/messages/crisis";
import { BUTTON } from "@/lib/site-styles";
import { cn } from "@/lib/utils";
import { normaliseReason, REASON_MAX, REASON_MIN, reasonProblem } from "@/lib/reason";
import { DEFAULT_RADIUS, RADIUS_PRESETS } from "@/lib/validation/crisis";
import type { CrisisTypeDTO, RadiusKm } from "@/types";

interface Props {
  /** Already named in `locale`. */
  crisisTypes: CrisisTypeDTO[];
  locale: Locale;
}

const EMPTY_LOCATION: LocationValue = { source: null, postcode: "", lat: null, lng: null };

export default function CrisisActivationForm({ crisisTypes, locale }: Props) {
  const t = crisisMessages[locale].form;
  const [crisisType, setCrisisType] = useState("");
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [radius, setRadius] = useState<RadiusKm>(DEFAULT_RADIUS);
  const [reason, setReason] = useState("");
  const [exercise, setExercise] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // A postcode counts once the lookup found it; the server resolves the raw centroid itself.
  // A pin abroad is refused here too (QA-024), so the form keeps the type and the pin.
  const locationReady =
    location.source !== null &&
    location.lat !== null &&
    location.lng !== null &&
    locationProblem(location, locale) === null;
  const reasonError = reasonProblem(normaliseReason(reason), locale);
  const reasonReady = reasonError === null;
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
            {t.typeLabel}
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
              {t.choose}
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
            {t.epicentre}
          </h3>
          <p className="text-ash mb-4 leading-relaxed">{t.epicentreHelp}</p>
          <LocationPicker
            locale={locale}
            value={location}
            initial={EMPTY_LOCATION}
            onChange={setLocation}
            hint={t.epicentreHint}
          />
        </section>

        <fieldset>
          <legend className="mb-2 font-bold">{t.radius}</legend>
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
                {format(crisisMessages[locale].format.km, { km })}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Stored with the crisis and seen by whoever reviews activations (security audit F-02). */}
        <div>
          <label htmlFor="reason" className="mb-2 block font-bold">
            {t.reasonLabel}
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
            placeholder={t.reasonPlaceholder}
          />
          <p id="reason-hint" className="text-ash mt-2 text-[0.9375rem]">
            {format(t.reasonHint, { min: REASON_MIN, max: REASON_MAX })}
          </p>
        </div>

        {/* Set once, at activation: the crisis page cannot turn an exercise into a real crisis. */}
        <div>
          <label htmlFor="exercise" className="flex min-h-11 cursor-pointer items-start gap-4 py-2.5">
            <input
              id="exercise"
              type="checkbox"
              name="exercise"
              value="1"
              checked={exercise}
              onChange={(e) => {
                setExercise(e.target.checked);
              }}
              aria-describedby="exercise-hint"
              className="check mt-0.5"
            />
            <span className="font-bold">{t.exerciseLabel}</span>
          </label>
          <p id="exercise-hint" className="text-ash max-w-[42rem] text-[0.9375rem] leading-relaxed">
            {t.exerciseHint}
          </p>
        </div>
      </div>

      {/* Consequential, so the one primary action stands apart from the fields, under a hairline. The
          hint keeps its line when empty, so nothing moves when it goes. */}
      <div className="border-seam mt-12 border-t pt-8">
        <p className="text-ash mb-4 min-h-7">{!locationReady ? t.needEpicentre : reasonError}</p>
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
          {submitting ? t.activating : exercise ? t.activateExercise : t.activateCrisis}
        </button>
      </div>
    </form>
  );
}

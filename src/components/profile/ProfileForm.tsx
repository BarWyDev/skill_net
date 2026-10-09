import { useEffect, useState } from "react";
import type React from "react";
import { AvailabilityGrid } from "@/components/profile/AvailabilityGrid";
import { LocationPicker, locationProblem, type LocationValue } from "@/components/profile/LocationPicker";
import { PhoneField } from "@/components/profile/PhoneField";
import { SkillsPicker, type SelectedSkills } from "@/components/profile/SkillsPicker";
import { formatPhone, normalisePhone, PHONE_ERROR } from "@/lib/phone";
import { normalisePostcode, POSTCODE_ERROR } from "@/lib/postcode";
import type { MyProfileDTO, SkillLevel, TaxonomyDTO } from "@/types";

interface Props {
  taxonomy: TaxonomyDTO;
  profile: MyProfileDTO;
}

export default function ProfileForm({ taxonomy, profile }: Props) {
  const [selected, setSelected] = useState<SelectedSkills>(() =>
    Object.fromEntries(profile.skills.map((s) => [s.slug, s.level])),
  );
  // The postcode is never stored, so the field always starts empty.
  const [initialLocation] = useState<LocationValue>(() => ({
    source: profile.locationSource,
    postcode: "",
    lat: profile.lat,
    lng: profile.lng,
  }));
  const [location, setLocation] = useState<LocationValue>(initialLocation);
  // Shown as `+48 600 123 456`; saving normalises the spaces away again (QA-018).
  const [phone, setPhone] = useState(profile.phone ? formatPhone(profile.phone) : "");
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [showMissingLevels, setShowMissingLevels] = useState(false);
  const [focusSkill, setFocusSkill] = useState<string | null>(null);

  // In taxonomy order, so the first one is the topmost on the page.
  const missingLevels = taxonomy.skills.filter((s) => s.hasLevel && s.slug in selected && selected[s.slug] === null);

  // Once the missing-level group is rendered with its error, bring it into view (QA-020).
  useEffect(() => {
    if (!focusSkill) return;
    const group = document.getElementById(`level-${focusSkill}`);
    group?.scrollIntoView({ block: "center" });
    group?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot request, cleared once handled
    setFocusSkill(null);
  }, [focusSkill]);

  // The "Zapisano." or `?error=` banner above describes the last save, not the edits since (QA-019).
  function dismissPageNotices() {
    document.querySelectorAll("[data-page-notice]").forEach((el) => {
      el.remove();
    });
  }

  function handleToggle(slug: string, checked: boolean) {
    setSelected((prev) => {
      if (checked) return { ...prev, [slug]: null };
      const { [slug]: _unchecked, ...rest } = prev;
      return rest;
    });
  }

  function handleLevel(slug: string, level: SkillLevel) {
    setSelected((prev) => ({ ...prev, [slug]: level }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (missingLevels.length > 0) {
      e.preventDefault();
      dismissPageNotices();
      setShowMissingLevels(true);
      setClientError(`Wybierz poziom dla: ${missingLevels.map((s) => s.name).join(", ")}.`);
      setFocusSkill(missingLevels[0].slug);
      return;
    }
    // An empty postcode keeps the stored postcode location.
    const postcode = location.postcode.trim();
    if (location.source === "postcode" && postcode && normalisePostcode(postcode) === null) {
      e.preventDefault();
      dismissPageNotices();
      setClientError(POSTCODE_ERROR);
      return;
    }
    // An unknown postcode or a pin abroad would be refused by the server, and the reload would
    // drop every unsaved edit (QA-017).
    const problem = locationProblem(location);
    if (problem) {
      e.preventDefault();
      dismissPageNotices();
      setClientError(problem);
      return;
    }
    // An empty phone deletes the stored number.
    if (phone.trim() && normalisePhone(phone) === null) {
      e.preventDefault();
      dismissPageNotices();
      setPhoneInvalid(true);
      setClientError(PHONE_ERROR);
      return;
    }
    setPhoneInvalid(false);
    setClientError(null);
  }

  return (
    <form
      method="POST"
      action="/api/profile"
      className="space-y-8"
      onSubmit={handleSubmit}
      onChange={dismissPageNotices}
      noValidate
    >
      <section aria-labelledby="skills-heading" className="space-y-3">
        <h2 id="skills-heading" className="text-lg font-semibold text-white">
          Umiejętności i sprzęt
        </h2>
        <p className="text-sm text-blue-100/70">
          Zaznacz, co umiesz lub co masz. Przy umiejętnościach wybierz swój poziom.
        </p>
        <SkillsPicker
          categories={taxonomy.categories}
          skills={taxonomy.skills}
          selected={selected}
          showMissingLevels={showMissingLevels}
          onToggle={handleToggle}
          onLevel={handleLevel}
        />
      </section>

      <section aria-labelledby="location-heading" className="space-y-3">
        <h2 id="location-heading" className="text-lg font-semibold text-white">
          Przybliżona lokalizacja
        </h2>
        <LocationPicker value={location} initial={initialLocation} onChange={setLocation} />
      </section>

      <section aria-labelledby="phone-heading" className="space-y-3">
        <h2 id="phone-heading" className="text-lg font-semibold text-white">
          Telefon (opcjonalnie)
        </h2>
        <PhoneField
          value={phone}
          invalid={phoneInvalid}
          onChange={(value) => {
            setPhone(value);
            setPhoneInvalid(false);
          }}
        />
      </section>

      <section aria-labelledby="availability-heading" className="space-y-3">
        <h2 id="availability-heading" className="text-lg font-semibold text-white">
          Dostępność (informacyjnie)
        </h2>
        <p className="text-sm text-blue-100/70">
          Zaznacz, kiedy zwykle możesz pomóc. To tylko informacja dla koordynatora — nikogo nie wyklucza z listy.
        </p>
        <AvailabilityGrid initial={profile.availabilitySlots} />
      </section>

      {Object.entries(selected).map(([slug, level]) => (
        <input key={slug} type="hidden" name="skill" value={level === null ? slug : `${slug}:${level}`} />
      ))}

      <div className="space-y-2">
        {clientError && (
          <p role="alert" className="rounded-lg border border-red-400/50 bg-red-500/15 p-3 text-sm text-red-100">
            {clientError}
          </p>
        )}
        <button
          type="submit"
          className="h-12 w-full rounded-lg bg-purple-600 px-6 font-medium text-white transition-colors hover:bg-purple-500 sm:w-auto"
        >
          Zapisz profil
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import type React from "react";
import { AvailabilityGrid } from "@/components/profile/AvailabilityGrid";
import { LocationPicker, locationProblem, type LocationValue } from "@/components/profile/LocationPicker";
import { PhoneField } from "@/components/profile/PhoneField";
import { SkillsPicker, type SelectedSkills } from "@/components/profile/SkillsPicker";
import { FieldError } from "@/components/auth/FieldError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatPhone, normalisePhone, PHONE_ERROR } from "@/lib/phone";
import { normalisePostcode, POSTCODE_ERROR } from "@/lib/postcode";
import type { MyProfileDTO, SkillLevel, TaxonomyDTO } from "@/types";
import { SECTION_TITLE } from "@/lib/site-styles";

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
  const [submitting, setSubmitting] = useState(false);

  // Back/forward restores this page from the bfcache with the spinner still on.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
    };
  }, []);

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

  // The "Zapisano." or `?error=` notice above describes the last save, not the edits since (QA-019).
  // It is hidden rather than removed, so the form below does not jump under the pointer.
  function dismissPageNotices() {
    document.querySelectorAll("[data-page-notice]").forEach((el) => {
      el.classList.add("invisible");
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
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/profile" onSubmit={handleSubmit} onChange={dismissPageNotices} noValidate>
      <div className="divide-seam mt-14 divide-y [&>section]:py-10 [&>section:first-child]:pt-0 [&>section:last-child]:pb-12">
        <section aria-labelledby="skills-heading">
          <SectionHeading
            id="skills-heading"
            help="Zaznacz, co umiesz lub co masz. Przy umiejętnościach wybierz poziom."
          >
            Umiejętności i sprzęt
          </SectionHeading>
          <SkillsPicker
            categories={taxonomy.categories}
            skills={taxonomy.skills}
            selected={selected}
            showMissingLevels={showMissingLevels}
            onToggle={handleToggle}
            onLevel={handleLevel}
          />
        </section>

        <section aria-labelledby="location-heading">
          <SectionHeading id="location-heading" help="Wpisz kod pocztowy albo zaznacz miejsce na mapie.">
            Przybliżona lokalizacja
          </SectionHeading>
          <LocationPicker value={location} initial={initialLocation} onChange={setLocation} />
        </section>

        <section aria-labelledby="phone-heading">
          <SectionHeading id="phone-heading" help="Opcjonalnie.">
            Telefon
          </SectionHeading>
          <PhoneField
            value={phone}
            invalid={phoneInvalid}
            onChange={(value) => {
              setPhone(value);
              setPhoneInvalid(false);
            }}
          />
        </section>

        <section aria-labelledby="availability-heading">
          <SectionHeading
            id="availability-heading"
            help="Zaznacz, kiedy zwykle możesz pomóc. To tylko informacja dla koordynatora — nikogo nie wyklucza z listy."
          >
            Dostępność
          </SectionHeading>
          <AvailabilityGrid initial={profile.availabilitySlots} />
        </section>
      </div>

      {Object.entries(selected).map(([slug, level]) => (
        <input key={slug} type="hidden" name="skill" value={level === null ? slug : `${slug}:${level}`} />
      ))}

      {/* The error sits under the button, so nothing above it moves when it appears. */}
      <div className="mt-2">
        <SubmitButton pending={submitting} pendingText="Zapisywanie…">
          Zapisz profil
        </SubmitButton>
        <div role="alert" className="min-h-8 font-bold">
          {clientError && <FieldError id="profile-form-error">{clientError}</FieldError>}
        </div>
      </div>
    </form>
  );
}

function SectionHeading({ id, help, children }: { id: string; help: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 id={id} className={SECTION_TITLE}>
        {children}
      </h2>
      <p className="text-ash mt-3 leading-relaxed">{help}</p>
    </div>
  );
}

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
import { SWITCH_OFF, SWITCH_ON } from "@/lib/visibility";
import type { MyProfileDTO, SkillLevel, TaxonomyDTO } from "@/types";
import { SECTION_TITLE } from "@/lib/site-styles";
import { cn } from "@/lib/utils";

interface Props {
  taxonomy: TaxonomyDTO;
  profile: MyProfileDTO;
}

export default function ProfileForm({ taxonomy, profile }: Props) {
  const [selected, setSelected] = useState<SelectedSkills>(() =>
    Object.fromEntries(profile.skills.map((s) => [s.slug, s.level])),
  );
  // Checked skills hidden from crises (V2); a skill unchecked and checked again starts as used.
  const [crisisOff, setCrisisOff] = useState<ReadonlySet<string>>(
    () => new Set(profile.skills.filter((s) => !s.crisis).map((s) => s.slug)),
  );
  const [showOnMap, setShowOnMap] = useState(profile.showOnMap);
  const [showAvailability, setShowAvailability] = useState(profile.showAvailabilityInCrisis);
  const [allowContactReveal, setAllowContactReveal] = useState(profile.allowContactReveal);
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

  // The "Zapisano." or error notice above describes the last save, not the edits since (QA-019).
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
    if (!checked) handleCrisis(slug, true);
  }

  function handleCrisis(slug: string, use: boolean) {
    setCrisisOff((prev) => {
      const next = new Set(prev);
      if (use) next.delete(slug);
      else next.add(slug);
      return next;
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
            help="Zaznacz, co umiesz lub co masz. Przy umiejętnościach wybierz poziom. Odznacz „Używaj w kryzysie”, jeśli koordynator nie ma brać danej umiejętności pod uwagę."
          >
            Umiejętności i sprzęt
          </SectionHeading>
          <SkillsPicker
            categories={taxonomy.categories}
            skills={taxonomy.skills}
            selected={selected}
            crisisOff={crisisOff}
            showMissingLevels={showMissingLevels}
            onToggle={handleToggle}
            onLevel={handleLevel}
            onCrisis={handleCrisis}
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

        <section aria-labelledby="visibility-heading">
          <SectionHeading
            id="visibility-heading"
            help="Zdecyduj, do czego wolno użyć Twoich danych. E-mail i dokładna lokalizacja nie są nikomu pokazywane."
          >
            Widoczność danych
          </SectionHeading>
          <div className="space-y-5">
            <VisibilitySwitch
              name="show_on_map"
              checked={showOnMap}
              onChange={setShowOnMap}
              label="Wliczaj mnie do publicznej mapy umiejętności"
              help="Mapa pokazuje tylko przedziały liczby osób w kwadratach 2 × 2 km. Zmiana działa od następnego dnia."
            />
            <VisibilitySwitch
              name="show_availability"
              checked={showAvailability}
              onChange={setShowAvailability}
              label="Pokazuj koordynatorowi, kiedy jestem dostępny"
              help="Wyłączone: w kryzysie koordynator zobaczy „nie podano”. Twoje miejsce na liście się nie zmienia."
            />
            <VisibilitySwitch
              name="allow_contact_reveal"
              checked={allowContactReveal}
              onChange={setAllowContactReveal}
              label="Pozwól koordynatorowi awaryjnie odsłonić mój numer"
              help="Gdy w kryzysie nie da się zawiadomić ludzi inaczej, koordynator może po podaniu powodu zobaczyć numery. Wyłączone: Twój numer zostanie pominięty."
            />
          </div>
        </section>
      </div>

      {Object.entries(selected).map(([slug, level]) => (
        <input key={slug} type="hidden" name="skill" value={level === null ? slug : `${slug}:${level}`} />
      ))}
      {Object.keys(selected)
        .filter((slug) => crisisOff.has(slug))
        .map((slug) => (
          <input key={slug} type="hidden" name="skill_crisis_off" value={slug} />
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

// A checkbox whose value always travels as "1" or "0" in a hidden field, so an unchecked box is
// never mistaken for a field that was not sent (which leaves the stored switch unchanged).
function VisibilitySwitch({
  name,
  checked,
  onChange,
  label,
  help,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-4 py-1">
        <input
          type="checkbox"
          checked={checked}
          aria-describedby={`${name}-help`}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
          className="check"
        />
        <span className={cn(checked ? "text-chalk" : "text-ash")}>{label}</span>
      </label>
      <p id={`${name}-help`} className="text-ash border-seam ml-3 border-l-2 pl-7 text-[0.9375rem] leading-relaxed">
        {help}
      </p>
      <input type="hidden" name={name} value={checked ? SWITCH_ON : SWITCH_OFF} />
    </div>
  );
}

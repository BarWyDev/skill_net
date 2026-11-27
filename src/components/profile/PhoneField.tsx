import type { Locale } from "@/lib/i18n/locale";
import { profile } from "@/lib/i18n/messages/profile";

interface Props {
  locale: Locale;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}

export function PhoneField({ locale, value, invalid, onChange }: Props) {
  const t = profile[locale].phone;
  return (
    <div>
      <label htmlFor="phone" className="mb-2 block font-bold">
        {t.label}
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="600 123 456"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby="phone-help"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="field h-12 w-full max-w-xs px-3 text-lg tabular-nums"
      />
      <ul id="phone-help" className="text-ash mt-3 list-[square] space-y-1 pl-5 leading-relaxed">
        <li>{t.onlyYou}</li>
        <li>{t.future}</li>
        <li>{t.noAlerts}</li>
      </ul>
    </div>
  );
}

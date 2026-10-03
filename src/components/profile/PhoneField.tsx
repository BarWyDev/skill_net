import { cn } from "@/lib/utils";

interface Props {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}

export function PhoneField({ value, invalid, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label htmlFor="phone" className="block text-sm text-blue-100">
        Numer telefonu komórkowego
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
        className={cn(
          "h-12 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-white placeholder:text-blue-100/40",
          invalid && "border-red-400/70",
        )}
      />
      <ul id="phone-help" className="list-disc space-y-1 pl-5 text-sm text-blue-100/70">
        <li>Numer widzisz tylko Ty.</li>
        <li>
          W przyszłych wersjach koordynator zobaczy go w trybie kryzysowym dopiero po tym, jak potwierdzisz gotowość do
          pomocy.
        </li>
        <li>Bez numeru nie otrzymasz alertów kryzysowych.</li>
      </ul>
    </div>
  );
}

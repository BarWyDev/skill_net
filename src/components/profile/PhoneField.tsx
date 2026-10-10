interface Props {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}

export function PhoneField({ value, invalid, onChange }: Props) {
  return (
    <div>
      <label htmlFor="phone" className="mb-2 block font-bold">
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
        className="field h-12 w-full max-w-xs px-3 text-lg tabular-nums"
      />
      <ul id="phone-help" className="text-ash mt-3 list-[square] space-y-1 pl-5 leading-relaxed">
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

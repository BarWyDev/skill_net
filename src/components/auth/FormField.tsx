import type { ReactNode } from "react";
import { FieldError } from "@/components/auth/FieldError";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  /** Quiet help under the field, replaced by the error when there is one. */
  hint?: string;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  hint,
  endContent,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-bold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("field h-12 w-full px-3 text-lg", endContent && "pr-12")}
        />
        {endContent}
      </div>
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        hint && (
          <p id={hintId} className="text-ash mt-2 text-[0.9375rem]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

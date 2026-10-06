import React, { useState } from "react";
import { Mail, Lock, UserPlus, CircleAlert } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { CONSENT_LABEL, CONSENT_LINK_TEXT, CONSENT_REQUIRED_MESSAGE } from "@/lib/consent";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  serverError?: string | null;
}

function charactersWord(n: number) {
  if (n === 1) return "znak";
  const lastTwo = n % 100;
  if (n % 10 >= 2 && n % 10 <= 4 && (lastTwo < 12 || lastTwo > 14)) return "znaki";
  return "znaków";
}

export default function SignUpForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Never pre-ticked: consent must be an explicit act.
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    consent?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail";
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same";
    }

    if (!consent) {
      next.consent = CONSENT_REQUIRED_MESSAGE;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const missing = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && missing > 0 ? (
      <p className="mt-1 text-xs text-blue-100/50">
        Jeszcze {missing} {charactersWord(missing)}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="ty@przyklad.pl"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={`Co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło jeszcze raz"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <div>
        <label htmlFor="consent" className="flex items-start gap-2 text-sm text-blue-100/80">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clearError("consent");
            }}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            className="mt-1 size-4 shrink-0 accent-purple-500"
          />
          <span>
            {CONSENT_LABEL}{" "}
            <a href="/prywatnosc" target="_blank" rel="noopener" className="text-purple-300 hover:underline">
              {CONSENT_LINK_TEXT}
            </a>
          </span>
        </label>
        {errors.consent && (
          <p id="consent-error" className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.consent}
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zakładanie konta..." icon={<UserPlus className="size-4" />}>
        Załóż konto
      </SubmitButton>
    </form>
  );
}

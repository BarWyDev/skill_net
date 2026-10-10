import React, { useEffect, useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { FieldError } from "@/components/auth/FieldError";
import { INLINE_LINK, TEXT_LINK } from "@/lib/site-styles";
import { authErrorMessage } from "@/lib/auth-errors";
import { CONSENT_LABEL, CONSENT_LINK_TEXT, CONSENT_REQUIRED_MESSAGE } from "@/lib/consent";

const MIN_PASSWORD_LENGTH = 6;

// Like the sign-in form's key: keeps the address across a failed sign-up without putting it in
// the URL. Removed by the next page load, here or by Layout.astro on any other page.
export const SIGNUP_EMAIL_STORAGE_KEY = "skillnet:signup-email";
const ACCOUNT_EXISTS_MESSAGE = authErrorMessage("user_already_exists");

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

  // After hydration, like SignInForm: the server render has no sessionStorage.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SIGNUP_EMAIL_STORAGE_KEY);
      sessionStorage.removeItem(SIGNUP_EMAIL_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of external storage after hydration
      if (serverError && saved) setEmail(saved);
    } catch {
      // Storage blocked: the address is typed again.
    }
  }, [serverError]);

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
      return;
    }
    try {
      sessionStorage.setItem(SIGNUP_EMAIL_STORAGE_KEY, email);
    } catch {
      // Storage blocked: only the prefill after an error is lost.
    }
  }

  const missing = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && missing > 0
      ? `Jeszcze ${missing} ${charactersWord(missing)}`
      : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-6" onSubmit={handleSubmit} noValidate>
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
        autoComplete="email"
        error={errors.email}
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
        autoComplete="new-password"
        error={errors.password}
        hint={passwordHint}
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
        autoComplete="new-password"
        error={errors.confirmPassword}
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
        <label
          htmlFor="consent"
          className="flex min-h-11 cursor-pointer items-start gap-4 py-2.5 text-[0.9375rem] leading-relaxed"
        >
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
            className="check mt-0.5"
          />
          <span>
            {CONSENT_LABEL}{" "}
            <a href="/prywatnosc" target="_blank" rel="noopener" className={INLINE_LINK}>
              {CONSENT_LINK_TEXT}
            </a>
          </span>
        </label>
        {errors.consent && <FieldError id="consent-error">{errors.consent}</FieldError>}
      </div>

      <div className="space-y-4">
        <ServerError message={serverError} />
        {serverError === ACCOUNT_EXISTS_MESSAGE && (
          <p>
            <a href="/auth/signin" className={TEXT_LINK}>
              Przejdź do logowania
            </a>
          </p>
        )}
        <SubmitButton pendingText="Zakładanie konta...">Załóż konto</SubmitButton>
      </div>
    </form>
  );
}

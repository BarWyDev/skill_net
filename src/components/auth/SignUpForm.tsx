import React, { useEffect, useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { FieldError } from "@/components/auth/FieldError";
import { INLINE_LINK, TEXT_LINK } from "@/lib/site-styles";
import { CONSENT_LABEL } from "@/lib/consent";
import { format, plural } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { auth } from "@/lib/i18n/messages/auth";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password";

// Like the sign-in form's key: keeps the address across a failed sign-up without putting it in
// the URL. Removed by the next page load, here or by Layout.astro on any other page.
export const SIGNUP_EMAIL_STORAGE_KEY = "skillnet:signup-email";

interface Props {
  locale: Locale;
  serverError?: string | null;
  /** The Turnstile widget (Turnstile.astro) passed as a slot. */
  captcha?: React.ReactNode;
}

export default function SignUpForm({ locale, serverError, captcha }: Props) {
  const t = auth[locale];
  // The Polish wording is the binding one (src/lib/consent.ts): a translated label shows it below.
  const consentIsTranslated = locale !== "pl";
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
      next.email = t.fields.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t.fields.emailInvalid;
    }

    if (!password) {
      next.password = t.fields.passwordRequired;
    } else {
      const problem = passwordProblem(password, locale);
      if (problem) next.password = problem;
    }

    if (!confirmPassword) {
      next.confirmPassword = t.signUp.confirmRequired;
    } else if (password !== confirmPassword) {
      next.confirmPassword = t.signUp.mismatch;
    }

    if (!consent) {
      next.consent = t.consent.required;
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
    errors.password || password.length === 0
      ? undefined
      : missing > 0
        ? format(plural(locale, missing, t.password.charactersLeft), { count: missing })
        : (passwordProblem(password, locale) ?? undefined);
  const consentDescribedBy =
    [consentIsTranslated && "consent-original", errors.consent && "consent-error"].filter(Boolean).join(" ") ||
    undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-6" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={t.fields.email}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={t.fields.emailPlaceholder}
        autoComplete="email"
        error={errors.email}
      />

      <FormField
        id="password"
        label={t.fields.password}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={format(t.password.placeholder, { min: MIN_PASSWORD_LENGTH })}
        autoComplete="new-password"
        error={errors.password}
        hint={passwordHint}
        endContent={
          <PasswordToggle
            visible={showPassword}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={t.signUp.confirmLabel}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={t.signUp.confirmPlaceholder}
        autoComplete="new-password"
        error={errors.confirmPassword}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
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
            aria-describedby={consentDescribedBy}
            className="check mt-0.5"
          />
          <span>
            {t.consent.label}{" "}
            <a href="/prywatnosc" target="_blank" rel="noopener" className={INLINE_LINK}>
              {t.consent.linkText}
            </a>
          </span>
        </label>
        {consentIsTranslated && (
          <p id="consent-original" className="text-ash pb-2.5 pl-10 text-sm leading-relaxed">
            {t.consent.bindingNote} <span lang="pl">{CONSENT_LABEL}</span>
          </p>
        )}
        {errors.consent && <FieldError id="consent-error">{errors.consent}</FieldError>}
      </div>

      {captcha}

      <div className="space-y-4">
        <ServerError message={serverError} />
        {serverError === t.errors.user_already_exists && (
          <p>
            <a href="/auth/signin" className={TEXT_LINK}>
              {t.signUp.goToSignIn}
            </a>
          </p>
        )}
        <SubmitButton pendingText={t.signUp.pending}>{t.signUp.submit}</SubmitButton>
      </div>
    </form>
  );
}

import React, { useEffect, useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { RETURN_PARAM } from "@/lib/return-path";
import { TEXT_LINK } from "@/lib/site-styles";
import { cn } from "@/lib/utils";

// Carries the address across the sign-in redirect, so a failed sign-in keeps it in the field and
// the resend block can use it, without it ever going into the URL. Tab-scoped, and removed by the
// next page load: here, or by Layout.astro on any other page.
export const EMAIL_STORAGE_KEY = "skillnet:signin-email";

interface Props {
  serverError?: string | null;
  // Sign-in failed with `email_not_confirmed`: offer a new confirmation link.
  unconfirmed?: boolean;
  /** A checked same-site path to go back to after signing in (`powrot`). */
  returnTo?: string | null;
}

export default function SignInForm({ serverError, unconfirmed = false, returnTo = null }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Runs after hydration on purpose: the server render has no sessionStorage, so reading it in a
  // useState initializer would make the hydrated markup disagree with the server's.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(EMAIL_STORAGE_KEY);
      sessionStorage.removeItem(EMAIL_STORAGE_KEY);
      // Only after a failed attempt: a fresh visit to the page starts empty.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of external storage after hydration
      if ((unconfirmed || serverError) && saved) setEmail(saved);
    } catch {
      // Storage blocked: the resident types the address again.
    }
  }, [unconfirmed, serverError]);

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail";
    }
    if (!password) {
      next.password = "Podaj hasło";
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
      sessionStorage.setItem(EMAIL_STORAGE_KEY, email);
    } catch {
      // Storage blocked: only the prefill after an error is lost.
    }
  }

  return (
    <>
      <form method="POST" action="/api/auth/signin" className="space-y-6" onSubmit={handleSubmit} noValidate>
        {returnTo && <input type="hidden" name={RETURN_PARAM} value={returnTo} />}
        <FormField
          id="email"
          type="email"
          label="E-mail"
          autoComplete="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            clearError("email");
          }}
          placeholder="ty@przyklad.pl"
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
          placeholder="Twoje hasło"
          autoComplete="current-password"
          error={errors.password}
          endContent={
            <PasswordToggle
              visible={showPassword}
              onToggle={() => {
                setShowPassword(!showPassword);
              }}
            />
          }
        />

        <div className="space-y-4 pt-2">
          <ServerError message={serverError} />
          <SubmitButton pendingText="Logowanie...">Zaloguj się</SubmitButton>
        </div>
      </form>

      {unconfirmed && (
        <form method="POST" action="/api/auth/resend" className="mt-10">
          <p className="text-ash max-w-[36ch] leading-relaxed">
            Link nie dotarł albo wygasł? Wyślemy nowy na adres podany powyżej.
          </p>
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={!email.trim()}
            className={cn(
              TEXT_LINK,
              "disabled:text-ash mt-1 cursor-pointer disabled:cursor-not-allowed disabled:no-underline",
            )}
          >
            Wyślij link ponownie
          </button>
        </form>
      )}
    </>
  );
}

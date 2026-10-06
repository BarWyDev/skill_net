import React, { useEffect, useState } from "react";
import { Mail, Lock, LogIn, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

// Carries the address across the sign-in redirect for the resend block, so it never goes into the
// URL. Tab-scoped, and removed by the next page load: here, or by Layout.astro on any other page.
export const EMAIL_STORAGE_KEY = "skillnet:signin-email";

interface Props {
  serverError?: string | null;
  // Sign-in failed with `email_not_confirmed`: offer a new confirmation link.
  unconfirmed?: boolean;
}

export default function SignInForm({ serverError, unconfirmed = false }: Props) {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of external storage after hydration
      if (unconfirmed && saved) setEmail(saved);
    } catch {
      // Storage blocked: the resident types the address again.
    }
  }, [unconfirmed]);

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
      // Storage blocked: only the resend prefill is lost.
    }
  }

  return (
    <>
      <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
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
          placeholder="Twoje hasło"
          error={errors.password}
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

        <ServerError message={serverError} />

        <SubmitButton pendingText="Logowanie..." icon={<LogIn className="size-4" />}>
          Zaloguj się
        </SubmitButton>
      </form>

      {unconfirmed && (
        <form
          method="POST"
          action="/api/auth/resend"
          className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-blue-100/80"
        >
          <p>Link nie dotarł albo wygasł? Wyślemy nowy na adres podany powyżej.</p>
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={!email.trim()}
            className="flex items-center gap-2 text-purple-300 hover:underline disabled:opacity-50 disabled:hover:no-underline"
          >
            <Send className="size-4" />
            Wyślij link ponownie
          </button>
        </form>
      )}
    </>
  );
}

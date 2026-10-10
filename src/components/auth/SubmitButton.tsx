import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { BUTTON } from "@/lib/site-styles";

interface SubmitButtonProps {
  pendingText: string;
  children: ReactNode;
  /** For a native form POST, which `useFormStatus` does not track: set once the submit goes ahead. */
  pending?: boolean;
}

// The landing's primary CTA. The spinner is the only motion on the auth pages.
export function SubmitButton({ pendingText, children, pending: submitting = false }: SubmitButtonProps) {
  const pending = useFormStatus().pending || submitting;

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(BUTTON, "btn-primary w-full cursor-pointer gap-3 disabled:cursor-wait sm:w-auto")}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="border-graphite/30 border-t-graphite size-4 animate-spin rounded-full border-2 motion-reduce:animate-none"
          />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

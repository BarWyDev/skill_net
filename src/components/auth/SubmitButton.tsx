import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { BUTTON } from "@/lib/site-styles";

interface SubmitButtonProps {
  pendingText: string;
  children: ReactNode;
}

// The landing's primary CTA. The spinner is the only motion on the auth pages.
export function SubmitButton({ pendingText, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

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

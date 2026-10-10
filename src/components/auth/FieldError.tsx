import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

// A field's error under it: alarm text with an icon, so colour is not the only signal.
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-alarm mt-2 flex gap-2 text-[0.9375rem]">
      <CircleAlert aria-hidden="true" className="mt-[0.2em] size-4 shrink-0" />
      {children}
    </p>
  );
}

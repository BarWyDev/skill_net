import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p role="alert" className="text-alarm flex gap-2 font-bold">
      <CircleAlert aria-hidden="true" className="mt-[0.25em] size-4 shrink-0" />
      {message}
    </p>
  );
}

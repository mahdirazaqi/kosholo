import { CircleAlert } from "lucide-react";

// Form-level error (e.g. wrong credentials), shown above the submit button.
export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
    >
      <CircleAlert className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

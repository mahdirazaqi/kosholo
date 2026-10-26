import { Label } from "@/components/ui/label";

// Label + control + error message. Labels and errors stay RTL even when the
// control itself is dir="ltr".
export function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs leading-5 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Props that wire an input to its FormField error.
export function fieldA11y(id: string, error?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

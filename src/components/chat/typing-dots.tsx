import { firstName } from "@/lib/chat/system-text";
import { cn } from "@/lib/utils";
import { toFaDigits } from "@/lib/digits";

// DIRECT: «در حال نوشتن»; GROUP: «علی در حال نوشتن» or «۳ نفر در حال نوشتن».
export function typingLabel(names: string[], isGroup: boolean) {
  if (!isGroup) return "در حال نوشتن";
  if (names.length === 1) return `${firstName(names[0])} در حال نوشتن`;
  return `${toFaDigits(names.length)} نفر در حال نوشتن`;
}

// Label followed by three bouncing dots.
export function TypingIndicator({
  label = "در حال نوشتن",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-primary", className)}>
      <span className="truncate">{label}</span>
      <span aria-hidden className="inline-flex shrink-0 items-end gap-0.5 pb-0.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
          />
        ))}
      </span>
    </span>
  );
}

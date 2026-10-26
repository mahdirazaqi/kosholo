import { cn } from "@/lib/utils";

// «در حال نوشتن» with three bouncing dots.
export function TypingIndicator({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-primary", className)}>
      در حال نوشتن
      <span aria-hidden className="inline-flex items-end gap-0.5 pb-0.5">
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

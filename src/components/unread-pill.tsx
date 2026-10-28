import { formatCount, formatNumber } from "@/lib/numbers";
import { cn } from "@/lib/utils";

// The one unread pill: capped at 99+, hidden at 0, gray when muted. The scale-in
// when the number changes is skipped for prefers-reduced-motion. Callers pass
// the count from the realtime store; nothing here (or anywhere else in the UI)
// counts messages.
export function UnreadPill({
  count,
  muted = false,
  className,
}: {
  count: number;
  muted?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      key={count}
      aria-label={formatCount(count, "unread message")}
      className={cn(
        "flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-150",
        muted ? "bg-muted-foreground/40 text-background" : "bg-primary text-primary-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : formatNumber(count)}
    </span>
  );
}

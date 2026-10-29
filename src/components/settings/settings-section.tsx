import { cn } from "@/lib/utils";

// A group: an optional small header above the card, the inset rounded card
// (grouped-cell, no border or shadow) and an optional footer under it. Header and
// footer text start where the row text starts.
export function SettingsSection({
  header,
  footer,
  footerTone = "muted",
  children,
  className,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  footerTone?: "muted" | "error";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-7 first:mt-0", className)}>
      {header && (
        <h2 className="px-4 pb-1.5 text-[13px] leading-4 font-medium tracking-wide text-muted-foreground uppercase">{header}</h2>
      )}
      <ul className="overflow-hidden rounded-xl bg-grouped-cell">{children}</ul>
      {footer && (
        <p
          className={cn(
            "px-4 pt-1.5 text-[13px] leading-[18px]",
            footerTone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {footer}
        </p>
      )}
    </section>
  );
}

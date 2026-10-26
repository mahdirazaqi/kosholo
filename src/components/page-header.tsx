import { cn } from "@/lib/utils";

// Sticky top bar rendered by each page inside the AppShell scroll area.
export function PageHeader({
  title,
  subtitle,
  start,
  end,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Slot before the title (e.g. a back button) and after it (actions).
  start?: React.ReactNode;
  end?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        {start}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs leading-5 text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {end}
      </div>
    </header>
  );
}

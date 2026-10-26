import { cn } from "@/lib/utils";

// One empty-state layout everywhere: icon, title, short description and an
// optional action.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-5 px-8 py-16 text-center", className)}>
      <div
        aria-hidden
        className="flex size-24 items-center justify-center rounded-[2rem] bg-muted text-muted-foreground [&_svg]:size-11 [&_svg]:stroke-[1.5]"
      >
        {icon}
      </div>
      <div className="max-w-xs space-y-1.5">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

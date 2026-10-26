import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Bottom sheet sized to the app column (centered on desktop), with a grab handle.
export function BottomSheetContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, "side">) {
  return (
    <SheetContent
      side="bottom"
      className={cn("mx-auto max-h-[90dvh] w-full max-w-md gap-2 overflow-y-auto rounded-t-3xl", className)}
      {...props}
    >
      <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
      {children}
    </SheetContent>
  );
}

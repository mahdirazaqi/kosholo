"use client";

import { BottomSheetContent } from "@/components/bottom-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type SheetAction = { label: string; onSelect: () => void; destructive?: boolean };

// iOS action sheet: a card with a short title/message and the actions (red for
// destructive ones), and a separate "Cancel" card under it. Replaces centred
// confirmation dialogs in the settings.
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="gap-0 bg-transparent p-0 shadow-none border-0 max-w-md">
        <div className="space-y-2 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="overflow-hidden rounded-2xl bg-grouped-cell">
            <div className="px-4 py-3.5 text-center">
              <SheetTitle className="text-[13px] font-semibold text-muted-foreground">{title}</SheetTitle>
              {description && <SheetDescription className="pt-0.5 text-[13px] leading-[18px]">{description}</SheetDescription>}
            </div>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  action.onSelect();
                }}
                className={cn(
                  "row-press no-press relative flex h-[57px] w-full items-center justify-center border-t border-grouped-separator text-[20px]",
                  action.destructive ? "text-destructive" : "text-link",
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="row-press no-press flex h-[57px] w-full items-center justify-center rounded-2xl bg-grouped-cell text-[20px] font-semibold text-link"
          >
            Cancel
          </button>
        </div>
      </BottomSheetContent>
    </Sheet>
  );
}

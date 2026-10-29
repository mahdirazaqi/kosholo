"use client";

import { vibrate } from "@/lib/client-utils";
import { cn } from "@/lib/utils";

// iOS-style switch: 51×31, the knob slides with a transform, the track is the
// theme's primary when on. A real role="switch" button.
export function IosSwitch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        vibrate(10);
        onCheckedChange(!checked);
      }}
      className={cn(
        "no-press relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className,
      )}
    >
      <span
        className={cn(
          "absolute start-0.5 top-0.5 size-[27px] rounded-full bg-overlay-foreground shadow-md transition-transform duration-200 ease-out",
          checked && "translate-x-5 rtl:-translate-x-5",
        )}
      />
    </button>
  );
}

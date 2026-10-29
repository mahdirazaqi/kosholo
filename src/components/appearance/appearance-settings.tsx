"use client";

import { useState } from "react";
import { Check, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { AppearancePreview } from "@/components/appearance/preview";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { resetAppearance, setAppearance, useAppearance, useDisplayMode } from "@/lib/appearance/runtime";
import { TEXT_SIZES, type TextSize } from "@/lib/appearance/settings";
import { THEMES } from "@/lib/appearance/themes";
import { Wallpaper, WALLPAPERS } from "@/lib/appearance/wallpapers";
import { vibrate } from "@/lib/client-utils";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function AppearanceSettings() {
  const appearance = useAppearance();
  const { mode, setMode } = useDisplayMode();
  const [confirmReset, setConfirmReset] = useState(false);
  const size = TEXT_SIZES[appearance.textSize - 1];

  return (
    <div className="space-y-6 px-4 pt-4 pb-8">
      <AppearancePreview />

      <Section title="Display mode" note="Only on this device">
        <div role="radiogroup" aria-label="Display mode" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {MODES.map(({ value, label, icon: Icon }) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  vibrate(10);
                  setMode(value);
                }}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
                  selected ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Color theme">
        <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-3 gap-2">
          {THEMES.map((theme) => {
            const selected = appearance.theme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  vibrate(10);
                  setAppearance({ theme: theme.id });
                }}
                className={cn(
                  "flex min-h-11 min-w-0 flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-3 transition-colors",
                  selected ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/60",
                )}
              >
                <span className="relative">
                  <span data-swatch={theme.id} className="swatch block size-12 border border-border">
                    <i /><i /><i /><i />
                  </span>
                  {selected && <CheckBadge />}
                </span>
                <span className="max-w-full truncate text-xs font-medium">{theme.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Chat wallpaper">
        <div role="radiogroup" aria-label="Chat wallpaper" className="grid grid-cols-4 gap-2">
          {WALLPAPERS.map((wallpaper) => {
            const selected = appearance.wallpaper === wallpaper.id;
            return (
              <button
                key={wallpaper.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  vibrate(10);
                  setAppearance({ wallpaper: wallpaper.id });
                }}
                className="flex min-w-0 flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    "relative block aspect-[3/4] w-full overflow-hidden rounded-xl border transition-shadow",
                    selected && "border-primary ring-2 ring-primary/30",
                  )}
                >
                  <Wallpaper id={wallpaper.id} className="wallpaper-thumb" />
                  <span className="absolute inset-x-1.5 bottom-3 flex flex-col gap-1">
                    <span className="h-3 w-3/5 rounded-md rounded-es-sm bg-bubble-in shadow-xs" />
                    <span className="h-3 w-1/2 self-end rounded-md rounded-ee-sm bg-bubble-out shadow-xs" />
                  </span>
                  {selected && <CheckBadge className="end-1 top-1" />}
                </span>
                <span className="max-w-full truncate text-[11px] font-medium">{wallpaper.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Message text size" note={`${size.label} · ${size.px}px`}>
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <span aria-hidden className="text-sm font-semibold">A</span>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={appearance.textSize}
            aria-label="Message text size"
            aria-valuetext={`${size.label}, ${size.px} pixels`}
            onChange={(event) => {
              vibrate(8);
              setAppearance({ textSize: Number(event.target.value) as TextSize });
            }}
            data-allow-zoom
            className="h-11 min-w-0 flex-1 touch-pan-y accent-primary"
          />
          <span aria-hidden className="text-2xl font-semibold leading-none">A</span>
        </div>
      </Section>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setConfirmReset(true)}
        className="h-11 w-full gap-2 rounded-xl text-base"
      >
        <RotateCcw />
        Reset to defaults
      </Button>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset appearance?"
        description="Theme, chat wallpaper and text size go back to Turquoise, Tile and Medium. Your display mode stays as it is."
        confirmLabel="Reset"
        onConfirm={() => {
          resetAppearance();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

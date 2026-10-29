"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AppearancePreview } from "@/components/appearance/preview";
import { ActionSheet } from "@/components/settings/action-sheet";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { ButtonRow, CheckRow, CustomRow, NavRow } from "@/components/settings/settings-row";
import { resetAppearance, setAppearance, useAppearance, useDisplayMode } from "@/lib/appearance/runtime";
import { TEXT_SIZES, type TextSize } from "@/lib/appearance/settings";
import { THEMES } from "@/lib/appearance/themes";
import { Wallpaper, WALLPAPERS } from "@/lib/appearance/wallpapers";
import { vibrate } from "@/lib/client-utils";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function modeLabel(mode: string) {
  return MODES.find((m) => m.value === mode)?.label ?? "System";
}

// /settings/appearance, built with the settings kit: the live preview, the display
// mode (a sub-page), the theme and wallpaper grids, the text size and a reset.
export function AppearanceSettings() {
  const appearance = useAppearance();
  const { mode } = useDisplayMode();
  const [confirmReset, setConfirmReset] = useState(false);
  const size = TEXT_SIZES[appearance.textSize - 1];

  return (
    <SettingsPage title="Appearance" backLabel="Settings">
      <AppearancePreview />

      <SettingsSection className="mt-7">
        <NavRow id="mode" label="Display mode" href="/settings/appearance/mode" value={modeLabel(mode)} />
      </SettingsSection>

      <SettingsSection header="Color theme">
        <CustomRow id="theme" className="p-3">
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
                  className="flex min-h-11 min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2"
                >
                  <span className="relative">
                    <span
                      data-swatch={theme.id}
                      className={cn("swatch block size-12 ring-offset-2 ring-offset-grouped-cell", selected ? "ring-2 ring-primary" : "ring-1 ring-border")}
                    >
                      <i /><i /><i /><i />
                    </span>
                    {selected && <CheckBadge />}
                  </span>
                  <span className="max-w-full truncate text-xs font-medium">{theme.name}</span>
                </button>
              );
            })}
          </div>
        </CustomRow>
      </SettingsSection>

      <SettingsSection header="Chat wallpaper">
        <CustomRow id="wallpaper" className="p-3">
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
                      "relative block aspect-[3/4] w-full overflow-hidden rounded-xl",
                      selected ? "ring-2 ring-primary" : "ring-1 ring-border",
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
        </CustomRow>
      </SettingsSection>

      <SettingsSection header="Message text size" footer={`${size.label}, ${size.px}px. Only message text changes; the rest of the app keeps its size.`}>
        <CustomRow id="text-size" className="px-4 py-2">
          <div className="flex items-center gap-3">
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
        </CustomRow>
      </SettingsSection>

      <SettingsSection>
        <ButtonRow id="reset-appearance" label="Reset to defaults" onSelect={() => setConfirmReset(true)} />
      </SettingsSection>

      <ActionSheet
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset appearance?"
        description="Theme, chat wallpaper and text size go back to Turquoise, Tile and Medium. Your display mode stays as it is."
        actions={[{ label: "Reset", destructive: true, onSelect: resetAppearance }]}
      />
    </SettingsPage>
  );
}

// /settings/appearance/mode: the single-choice list (checkmark rows, never a dropdown).
export function DisplayModeSettings() {
  const { mode, setMode } = useDisplayMode();
  return (
    <SettingsPage title="Display Mode" backLabel="Appearance" backHref="/settings/appearance" largeTitle={false}>
      <SettingsSection footer="System follows your device. This choice is only for this device.">
        {MODES.map((option) => (
          <CheckRow key={option.value} label={option.label} selected={mode === option.value} onSelect={() => setMode(option.value)} />
        ))}
      </SettingsSection>
    </SettingsPage>
  );
}

function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-grouped-cell",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

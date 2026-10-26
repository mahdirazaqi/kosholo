"use client";

import { useSyncExternalStore } from "react";
import { Bell, Info, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { InstallSettingsRow } from "@/components/pwa/install";
import { Switch } from "@/components/ui/switch";
import { toFaDigits } from "@/lib/digits";
import { playNotificationSound, unlockAudio } from "@/lib/pwa/notification-sound";
import { updateSettings, useDeviceSettings } from "@/lib/pwa/settings";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "system", label: "سیستم", icon: Monitor },
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تیره", icon: Moon },
] as const;

const noop = () => () => {};

// Per-device settings (theme via next-themes, the rest in localStorage).
export function SettingsSection({ version }: { version: string }) {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known after mount.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const settings = useDeviceSettings();

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 text-card-foreground" aria-labelledby="settings-title">
      <h2 id="settings-title" className="text-base font-semibold">
        تنظیمات
      </h2>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Palette className="size-4" />
          ظاهر
        </h3>
        <div role="radiogroup" aria-label="پوسته" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {THEMES.map(({ value, label, icon: Icon }) => {
            const selected = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Bell className="size-4" />
          اعلان‌ها
        </h3>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 hover:bg-muted/60">
          <span className="text-base">صدای پیام جدید</span>
          <Switch
            checked={mounted && settings.sound}
            onCheckedChange={(checked) => {
              updateSettings({ sound: checked });
              if (checked) {
                unlockAudio();
                setTimeout(playNotificationSound, 50); // preview
              }
            }}
            aria-label="صدای پیام جدید"
          />
        </label>
      </div>

      <div className="space-y-1">
        <InstallSettingsRow />
        <div className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base [&_svg]:size-5 [&_svg]:text-muted-foreground">
          <Info />
          <span className="flex-1">درباره</span>
          <span className="text-sm text-muted-foreground">کوشولو، نسخه‌ی {toFaDigits(version)}</span>
        </div>
      </div>
    </section>
  );
}

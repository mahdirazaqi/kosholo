"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Info, Palette } from "lucide-react";
import { AppBadgeSetting } from "@/components/pwa/app-badge-setting";
import { InstallSettingsRow } from "@/components/pwa/install";
import { Switch } from "@/components/ui/switch";
import { useAppearance } from "@/lib/appearance/runtime";
import { THEMES } from "@/lib/appearance/themes";
import { playNotificationSound, unlockAudio } from "@/lib/pwa/notification-sound";
import { updateSettings, useDeviceSettings } from "@/lib/pwa/settings";

const noop = () => () => {};

// Per-device settings (in localStorage) and the link to the appearance page.
export function SettingsSection({ version }: { version: string }) {
  const appearance = useAppearance();
  // The stored theme is only known after mount.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const settings = useDeviceSettings();

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 text-card-foreground" aria-labelledby="settings-title">
      <h2 id="settings-title" className="text-base font-semibold">
        Settings
      </h2>

      <Link
        href="/settings/appearance"
        className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-muted/60 [&_svg]:size-5 [&_svg]:text-muted-foreground"
      >
        <Palette />
        <span className="flex-1">Appearance</span>
        <span className="text-sm text-muted-foreground">{THEMES.find((t) => t.id === appearance.theme)?.name}</span>
        <ChevronRight className="rtl:rotate-180" />
      </Link>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Bell className="size-4" />
          Notifications
        </h3>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 hover:bg-muted/60">
          <span className="text-base">Notification sound</span>
          <Switch
            checked={mounted && settings.sound}
            onCheckedChange={(checked) => {
              updateSettings({ sound: checked });
              if (checked) {
                unlockAudio();
                setTimeout(playNotificationSound, 50); // preview
              }
            }}
            aria-label="Notification sound"
          />
        </label>
        <AppBadgeSetting />
      </div>

      <div className="space-y-1">
        <InstallSettingsRow />
        <div className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base [&_svg]:size-5 [&_svg]:text-muted-foreground">
          <Info />
          <span className="flex-1">About</span>
          <span className="text-sm text-muted-foreground">Kosholo, version {version}</span>
        </div>
      </div>
    </section>
  );
}

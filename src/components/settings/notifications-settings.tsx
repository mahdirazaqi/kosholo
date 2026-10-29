"use client";

import { useState, useSyncExternalStore } from "react";
import { BadgeInfo, Bell, Vibrate } from "lucide-react";
import { toast } from "sonner";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { ToggleRow } from "@/components/settings/settings-row";
import { vibrate } from "@/lib/client-utils";
import { isIosStandalone } from "@/lib/pwa/badges";
import { playNotificationSound, unlockAudio } from "@/lib/pwa/notification-sound";
import { updateSettings, useDeviceSettings } from "@/lib/pwa/settings";

const noop = () => () => {};

export function NotificationsSettings() {
  const settings = useDeviceSettings();
  return (
    <SettingsPage title="Notifications & Sounds" backLabel="Settings">
      <SettingsSection header="Messages" footer="These apply to this device only.">
        <ToggleRow
          id="sound"
          label="New message sound"
          icon={Bell}
          tile="red"
          checked={settings.sound}
          onCheckedChange={(checked) => {
            updateSettings({ sound: checked });
            if (checked) {
              unlockAudio();
              setTimeout(playNotificationSound, 50); // preview
            }
          }}
        />
        <ToggleRow
          id="haptics"
          label="Vibration"
          icon={Vibrate}
          tile="orange"
          checked={settings.haptics}
          onCheckedChange={(checked) => {
            updateSettings({ haptics: checked });
            if (checked) vibrate(15); // preview, only now that it's on
          }}
        />
      </SettingsSection>
      <AppBadgeSection />
      <p className="px-4 pt-6 text-[13px] leading-[18px] text-muted-foreground">
        Muted chats make no sound and aren&apos;t counted in the unread badge.
      </p>
    </SettingsPage>
  );
}

// iOS/iPadOS (16.4+, installed to the Home Screen) only shows the icon badge when
// notification permission is granted, and permission can only be requested from a
// tap, so it's a setting and never asked automatically. Desktop Chrome/Edge need
// nothing, and Android Chrome has no icon badge, so the section doesn't exist there.
function AppBadgeSection() {
  const applicable = useSyncExternalStore(
    noop,
    () => isIosStandalone() && "Notification" in window && "setAppBadge" in navigator,
    () => false,
  );
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const current = permission ?? (applicable ? Notification.permission : "default");
  if (!applicable) return null;

  async function enable() {
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      toast.error("Couldn't ask for permission");
    }
  }

  return (
    <SettingsSection
      header="Badge"
      className="mt-7"
      footer={
        current === "granted"
          ? "On. To turn it off, use iOS Settings → Notifications → Kosholo."
          : current === "denied"
            ? "Not allowed. To enable it, open iOS Settings → Notifications → Kosholo and allow notifications."
            : "iOS only shows the count after you allow notifications for this app."
      }
    >
      <ToggleRow
        id="app-badge"
        label="Show unread count on the app icon"
        icon={BadgeInfo}
        tile="pink"
        checked={current === "granted"}
        disabled={current !== "default"}
        onCheckedChange={(checked) => checked && void enable()}
      />
    </SettingsSection>
  );
}

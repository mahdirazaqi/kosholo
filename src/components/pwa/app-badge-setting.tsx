"use client";

import { useState, useSyncExternalStore } from "react";
import { BadgeInfo } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { isIosStandalone } from "@/lib/pwa/badges";

const noop = () => () => {};

// iOS/iPadOS (16.4+, installed to the Home Screen) only shows the icon badge
// when notification permission is granted, and the permission can only be
// requested from a tap, so it's a setting and never asked automatically.
// Desktop Chrome/Edge need nothing, and Android Chrome has no icon badge, so
// the row doesn't exist there.
export function AppBadgeSetting() {
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
    <div className="space-y-1 rounded-xl px-3 py-2">
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <BadgeInfo className="size-5 text-muted-foreground" />
        <span className="flex-1 text-base">Show unread count on the app icon</span>
        <Switch
          checked={current === "granted"}
          disabled={current !== "default"}
          onCheckedChange={(checked) => checked && void enable()}
          aria-label="Show unread count on the app icon"
        />
      </label>
      <p className="ps-8 text-sm leading-6 text-muted-foreground">
        {current === "granted" ? (
          <>On. To turn it off, use iOS Settings → Notifications → Kosholo.</>
        ) : current === "denied" ? (
          <>Not allowed. To enable it, open iOS Settings → Notifications → Kosholo and allow notifications.</>
        ) : (
          <>iOS only shows the count after you allow notifications for this app.</>
        )}
      </p>
    </div>
  );
}

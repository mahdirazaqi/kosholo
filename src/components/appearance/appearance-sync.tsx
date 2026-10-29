"use client";

import { useEffect } from "react";
import { getAppearance, saveAppearance } from "@/app/(app)/appearance-actions";
import { saveName } from "@/app/(app)/profile-actions";
import { connectName, flushName } from "@/lib/profile/name-queue";
import { applyRemoteAppearance, connectAppearance, flushAppearance } from "@/lib/appearance/runtime";

const REFRESH_AFTER_MS = 30_000;

// (Also sends a queued name edit, see lib/profile/name-queue.)
// Keeps this device's theme, wallpaper and text size in step with the account:
// sends a queued change (also after being offline), and takes the account's
// value on start, when back online and when the tab is visible again. The server
// wins, unless a change of mine is still waiting to be saved. Live changes from
// other devices arrive through user:updated (RealtimeProvider).
export function AppearanceSync({ userId }: { userId: string }) {
  useEffect(() => {
    const disconnect = connectAppearance(userId, saveAppearance);
    const disconnectName = connectName(userId, saveName);
    let last = 0;
    const refresh = async () => {
      if (!navigator.onLine || Date.now() - last < REFRESH_AFTER_MS) return;
      last = Date.now();
      await flushAppearance();
      try {
        applyRemoteAppearance(await getAppearance());
      } catch {
        // Offline or the server is unreachable: keep what is cached.
      }
    };
    const onOnline = () => {
      void flushName();
      last = 0;
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disconnect();
      disconnectName();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);
  return null;
}

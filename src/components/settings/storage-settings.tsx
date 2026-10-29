"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ActionSheet } from "@/components/settings/action-sheet";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { CustomRow, DestructiveRow, ValueRow } from "@/components/settings/settings-row";
import { type StorageGroup, useStorageStats } from "@/hooks/use-storage";
import { formatBytes } from "@/lib/numbers";
import { clearAppCaches } from "@/lib/pwa/caches";
import { cn } from "@/lib/utils";

const GROUPS: { id: StorageGroup; label: string; swatch: string }[] = [
  { id: "media", label: "Photos & thumbnails", swatch: "bg-tile-blue" },
  { id: "maps", label: "Map tiles", swatch: "bg-tile-green" },
  { id: "pages", label: "Saved pages", swatch: "bg-tile-orange" },
  { id: "app", label: "App files & other", swatch: "bg-tile-gray" },
];

// /settings/storage: used space with a segmented bar and legend, what is cached on
// this device, and "Clear cache" (an action sheet). Your messages live on the server.
export function StorageSettings() {
  const { stats, refresh } = useStorageStats();
  const [confirm, setConfirm] = useState(false);
  const total = stats ? GROUPS.reduce((sum, group) => sum + stats.groups[group.id], 0) : 0;
  const cacheTotal = stats ? stats.groups.media + stats.groups.maps + stats.groups.pages : 0;

  return (
    <SettingsPage title="Data & Storage" backLabel="Settings">
      <SettingsSection header="Usage" footer={stats && stats.quota > 0 ? `${formatBytes(stats.usage)} used of about ${formatBytes(stats.quota)} available to this app.` : undefined}>
        <CustomRow id="usage" className="px-4 py-3.5">
          <p className="text-[28px] leading-8 font-bold">{stats ? formatBytes(stats.usage) : "…"}</p>
          <div
            role="img"
            aria-label="Storage breakdown"
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            {stats &&
              total > 0 &&
              GROUPS.map((group) => (
                <span key={group.id} className={cn("h-full", group.swatch)} style={{ width: `${(stats.groups[group.id] / total) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {GROUPS.map((group) => (
              <li key={group.id} className="flex items-center gap-2 text-[15px]">
                <span className={cn("size-2.5 shrink-0 rounded-full", group.swatch)} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="text-muted-foreground">{stats ? formatBytes(stats.groups[group.id]) : "…"}</span>
              </li>
            ))}
          </ul>
        </CustomRow>
      </SettingsSection>

      <SettingsSection
        header="Cache"
        className="mt-7"
        footer="Clearing the cache removes downloaded photos, thumbnails, map tiles and saved pages from this device. Your messages and media stay on the server and are downloaded again when you need them."
      >
        <ValueRow id="cached" label="Cached on this device" value={stats ? formatBytes(cacheTotal) : "…"} />
        <DestructiveRow id="clear-cache" label="Clear cache" onSelect={() => setConfirm(true)} />
      </SettingsSection>

      <ActionSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear cache?"
        description="Photos and maps will load again the next time you open them."
        actions={[
          {
            label: "Clear cache",
            destructive: true,
            onSelect: async () => {
              await clearAppCaches();
              await refresh();
              toast.success("Cache cleared");
            },
          },
        ]}
      />
    </SettingsPage>
  );
}

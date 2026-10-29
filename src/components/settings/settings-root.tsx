"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Bookmark, Camera, Database, Info, Lock, Loader2, Paintbrush } from "lucide-react";
import { SettingsPage } from "@/components/settings/settings-page";
import { LogoutRow } from "@/components/settings/logout-row";
import { SearchField, SettingsSearchResults } from "@/components/settings/settings-search";
import { SettingsSection } from "@/components/settings/settings-section";
import { NavRow } from "@/components/settings/settings-row";
import { InstallSettingsRow } from "@/components/pwa/install";
import { UserAvatar } from "@/components/user-avatar";
import { useMyPhotos } from "@/hooks/use-my-photos";
import { useStorageUsage } from "@/hooks/use-storage";
import { useAppearance } from "@/lib/appearance/runtime";
import { THEMES } from "@/lib/appearance/themes";
import { formatBytes } from "@/lib/numbers";
import { useDeviceSettings } from "@/lib/pwa/settings";
import { useDisplayName } from "@/lib/profile/name-queue";
import type { ProfilePhotoItem } from "@/lib/types/profile";

type Me = { id: string; name: string; username: string; email: string; avatarUrl: string | null };

// /settings: the profile header, the search field and the grouped sections.
export function SettingsRoot({ user, initialPhotos, version }: { user: Me; initialPhotos: ProfilePhotoItem[]; version: string }) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const appearance = useAppearance();
  const settings = useDeviceSettings();
  const usage = useStorageUsage();
  const name = useDisplayName(user.id, user.name);
  const photos = useMyPhotos(user.id, initialPhotos);

  return (
    <SettingsPage
      title="Settings"
      largeTitle={false}
      end={
        <Link href="/settings/profile" className="flex min-h-11 items-center px-3 text-[17px] text-link">
          Edit
        </Link>
      }
    >
      {!searching && (
        <div className="flex flex-col items-center pt-2 pb-5 text-center">
          <button
            type="button"
            aria-label={photos.photos.length > 0 ? "View profile photos" : "Profile photo"}
            disabled={photos.photos.length === 0}
            onClick={() => photos.openViewer(0)}
            className="no-press rounded-full"
          >
            <UserAvatar user={{ ...user, name }} size="2xl" className="size-24" />
          </button>
          <button
            type="button"
            onClick={photos.pick}
            disabled={photos.uploading !== null || photos.full}
            className="flex min-h-11 items-center gap-1.5 px-3 text-[15px] text-link disabled:opacity-60"
          >
            {photos.uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Set profile photo
          </button>
          <h2 dir="auto" className="max-w-full truncate text-[24px] leading-7 font-semibold">{name}</h2>
          <p className="mt-0.5 max-w-full truncate text-[15px] text-muted-foreground">
            <bdi dir="ltr">@{user.username}</bdi> • <bdi dir="ltr">{user.email}</bdi>
          </p>
        </div>
      )}

      <SearchField value={query} onChange={setQuery} />

      {searching ? (
        <SettingsSearchResults query={query} />
      ) : (
        <>
          <SettingsSection>
            <NavRow id="saved" label="Saved Messages" icon={Bookmark} tile="blue" href="/saved" prefetch={false} />
          </SettingsSection>

          <SettingsSection>
            <NavRow
              id="notifications"
              label="Notifications & Sounds"
              icon={Bell}
              tile="red"
              href="/settings/notifications"
              value={settings.sound ? "On" : "Off"}
            />
            <NavRow id="privacy" label="Privacy & Security" icon={Lock} tile="gray" href="/settings/privacy" />
            <NavRow
              id="storage"
              label="Data & Storage"
              icon={Database}
              tile="green"
              href="/settings/storage"
              value={usage === null ? undefined : formatBytes(usage)}
            />
            <NavRow
              id="appearance"
              label="Appearance"
              icon={Paintbrush}
              tile="teal"
              href="/settings/appearance"
              value={THEMES.find((theme) => theme.id === appearance.theme)?.name}
            />
          </SettingsSection>

          <SettingsSection>
            <InstallSettingsRow />
            <NavRow id="about" label="About" icon={Info} tile="gray" href="/settings/about" value={version} />
          </SettingsSection>

          <SettingsSection>
            <LogoutRow />
          </SettingsSection>
        </>
      )}
      {photos.element}
    </SettingsPage>
  );
}


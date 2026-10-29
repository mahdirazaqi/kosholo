"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { FieldRow, ValueRow } from "@/components/settings/settings-row";
import { UserAvatar } from "@/components/user-avatar";
import { useMyPhotos } from "@/hooks/use-my-photos";
import { queueName, useDisplayName } from "@/lib/profile/name-queue";
import type { ProfilePhotoItem } from "@/lib/types/profile";
import { cn } from "@/lib/utils";

const NAME_MAX = 40;

// /settings/profile: photo, the name as an inline field, read-only username and
// email. Cancel / Save sit in the top bar; the name is saved offline-first
// (shown at once, sent when there is a connection).
export function ProfileEdit({
  user,
  initialPhotos,
}: {
  user: { id: string; name: string; username: string; email: string; avatarUrl: string | null };
  initialPhotos: ProfilePhotoItem[];
}) {
  const router = useRouter();
  const current = useDisplayName(user.id, user.name);
  const [name, setName] = useState(current);
  const photos = useMyPhotos(user.id, initialPhotos);
  const trimmed = name.trim();
  const changed = trimmed !== current && trimmed.length > 0 && trimmed.length <= NAME_MAX;

  function save() {
    if (!changed) return;
    queueName(user.id, trimmed);
    toast.success(navigator.onLine ? "Name saved" : "Name saved, it will sync when you're online");
    router.back();
  }

  return (
    <SettingsPage
      title="Edit Profile"
      largeTitle={false}
      start={
        <button type="button" onClick={() => router.back()} className="flex min-h-11 items-center px-3 text-[17px] text-link">
          Cancel
        </button>
      }
      end={
        <button
          type="button"
          onClick={save}
          disabled={!changed}
          className={cn("flex min-h-11 items-center px-3 text-[17px] font-semibold text-link", !changed && "opacity-40")}
        >
          Save
        </button>
      }
    >
      <div className="flex flex-col items-center pt-2 pb-5">
        <button
          type="button"
          aria-label="View profile photos"
          disabled={photos.photos.length === 0}
          onClick={() => photos.openViewer(0)}
          className="no-press rounded-full"
        >
          <UserAvatar user={{ ...user, name: current }} size="2xl" className="size-24" />
        </button>
        <button
          id="photo"
          data-setting="photo"
          type="button"
          onClick={photos.pick}
          disabled={photos.uploading !== null || photos.full}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[17px] text-link disabled:opacity-60"
        >
          {photos.uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          Set new photo
        </button>
        {photos.photos.length > 1 && (
          <ul className="scroll-strip mt-1 flex max-w-full gap-2 px-1" aria-label="Your photos">
            {photos.photos.map((photo, index) => (
              <li key={photo.id} className="shrink-0">
                <button
                  type="button"
                  aria-label={`Photo ${index + 1}${photo.isMain ? " (main)" : ""}`}
                  onClick={() => photos.openViewer(index)}
                  className={cn("block size-14 overflow-hidden rounded-xl bg-muted", photo.isMain && "ring-2 ring-primary ring-offset-2 ring-offset-grouped-bg")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img draggable={false} src={photo.thumbUrl} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SettingsSection footer="Your name is shown to all your contacts.">
        <FieldRow
          id="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && save()}
          maxLength={NAME_MAX}
          autoComplete="name"
          enterKeyHint="done"
          dir="auto"
        />
      </SettingsSection>

      <SettingsSection footer="Your username and email can't be changed.">
        <ValueRow id="username" label="Username" value={`@${user.username}`} copyable dir="ltr" />
        <ValueRow id="email" label="Email" value={user.email} copyable dir="ltr" />
      </SettingsSection>
      {photos.element}
    </SettingsPage>
  );
}

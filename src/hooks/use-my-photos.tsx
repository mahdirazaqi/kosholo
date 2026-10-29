"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteProfilePhoto, setMainProfilePhoto } from "@/app/(app)/profile-photo-actions";
import { ProfilePhotoViewer } from "@/components/profile/photo-viewer";
import { useAddProfilePhotos } from "@/hooks/use-add-profile-photos";
import { useProfilePhotos } from "@/hooks/use-profile-photos";
import { guardOnline } from "@/lib/client-utils";
import { MAX_PROFILE_PHOTOS } from "@/lib/media/limits";
import { setAvatarOverride } from "@/lib/realtime/client/store";
import type { ProfilePhotoItem } from "@/lib/types/profile";

// My own gallery for the settings pages: the photos (live), the viewer with its
// owner actions (set main / delete), and "set a new photo" (multi-select, crop,
// upload). Changes are optimistic and roll back on failure; every change needs a
// connection.
export function useMyPhotos(userId: string, initialPhotos: ProfilePhotoItem[]) {
  const [photos, setPhotos] = useProfilePhotos(userId, initialPhotos);
  const [viewer, setViewer] = useState<number | null>(null);
  const add = useAddProfilePhotos({ count: photos.length, onPhotos: apply });

  // Server truth; also the main photo shown everywhere for me, at once.
  function apply(next: ProfilePhotoItem[]) {
    setPhotos(next);
    setAvatarOverride(userId, next[0]?.fullUrl ?? null);
  }

  async function mutate(optimistic: ProfilePhotoItem[], call: () => ReturnType<typeof deleteProfilePhoto>, success: string) {
    if (!guardOnline()) return;
    const before = photos;
    setPhotos(optimistic);
    const result = await call().catch(() => null);
    if (!result?.ok) {
      setPhotos(before);
      return void toast.error(result?.ok === false ? result.error : "Something went wrong, please try again");
    }
    apply(result.photos);
    toast.success(success);
    if (result.photos.length === 0) setViewer(null);
  }

  const setMain = (photo: ProfilePhotoItem) =>
    mutate(
      [{ ...photo, isMain: true }, ...photos.filter((p) => p.id !== photo.id).map((p) => ({ ...p, isMain: false }))],
      () => setMainProfilePhoto(photo.id),
      "Main photo changed",
    );
  const remove = (photo: ProfilePhotoItem) => {
    const rest = photos.filter((p) => p.id !== photo.id);
    return mutate(rest.map((p, i) => ({ ...p, isMain: i === 0 })), () => deleteProfilePhoto(photo.id), "Photo deleted");
  };

  const full = photos.length >= MAX_PROFILE_PHOTOS;
  function pick() {
    if (!guardOnline()) return;
    add.pick();
  }

  const element = (
    <>
      {viewer !== null && photos.length > 0 && (
        <ProfilePhotoViewer
          photos={photos}
          startIndex={viewer}
          onClose={() => setViewer(null)}
          owner={{ onSetMain: (photo) => void setMain(photo), onDelete: (photo) => void remove(photo) }}
        />
      )}
      {add.element}
    </>
  );

  return { photos, openViewer: setViewer, pick, uploading: add.progress, full, element };
}

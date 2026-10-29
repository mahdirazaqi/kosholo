"use client";

import { useState } from "react";
import { Camera, EllipsisVertical, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProfilePhoto, setMainProfilePhoto } from "@/app/(app)/profile-photo-actions";
import { ProfilePhotoViewer } from "@/components/profile/photo-viewer";
import { ProfilePhotoHeader } from "@/components/profile/profile-photo-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAddProfilePhotos } from "@/hooks/use-add-profile-photos";
import { useProfilePhotos } from "@/hooks/use-profile-photos";
import { MAX_PROFILE_PHOTOS } from "@/lib/media/limits";
import { formatNumber } from "@/lib/numbers";
import { setAvatarOverride } from "@/lib/realtime/client/store";
import type { ProfilePhotoItem } from "@/lib/types/profile";
import { cn } from "@/lib/utils";

// My profile: the pager header, "Add photo", and a strip of thumbnails to
// manage the gallery. Changes are optimistic and roll back on failure.
export function ProfilePhotosSection({
  user,
  initialPhotos,
  children,
}: {
  user: { id: string; name: string; username: string };
  initialPhotos: ProfilePhotoItem[];
  children?: React.ReactNode; // the name/email block below
}) {
  const [photos, setPhotos] = useProfilePhotos(user.id, initialPhotos);
  const [viewer, setViewer] = useState<number | null>(null);
  const { pick, element, progress } = useAddProfilePhotos({ count: photos.length, onPhotos: apply });

  // Server truth (also the main photo shown everywhere for me, at once).
  function apply(next: ProfilePhotoItem[]) {
    setPhotos(next);
    setAvatarOverride(user.id, next[0]?.fullUrl ?? null); // fullUrl is /api/media/{id}, the same as User.avatarUrl
  }

  async function mutate(optimistic: ProfilePhotoItem[], call: () => ReturnType<typeof deleteProfilePhoto>, success: string) {
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

  return (
    <>
      <ProfilePhotoHeader
        photos={photos}
        user={user}
        subtitle={<bdi dir="ltr">@{user.username}</bdi>}
        stickyTop="calc(3.5rem + env(safe-area-inset-top))"
        onOpenViewer={setViewer}
      />

      <div className="space-y-4 px-4 py-4">
        <Button
          size="lg"
          onClick={pick}
          disabled={progress !== null || photos.length >= MAX_PROFILE_PHOTOS}
          className="h-12 w-full rounded-xl text-base"
        >
          {progress ? <Loader2 className="animate-spin" /> : <Camera />}
          {progress
            ? `Uploading ${formatNumber(Math.min(progress.done + 1, progress.total))} of ${formatNumber(progress.total)}…`
            : "Add photo"}
        </Button>

        {photos.length > 0 && (
          <ul className="scroll-strip -mx-4 flex gap-2 px-4 pb-1" aria-label="Your photos">
            {photos.map((photo, index) => (
              <li key={photo.id} className="relative shrink-0">
                <button
                  type="button"
                  aria-label={`Photo ${index + 1}${photo.isMain ? " (main)" : ""}`}
                  onClick={() => setViewer(index)}
                  className={cn("block size-16 overflow-hidden rounded-xl bg-muted", photo.isMain && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img draggable={false} src={photo.thumbUrl} alt="" className="size-full object-cover" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options for photo ${index + 1}`}
                      className="absolute end-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-viewer/55 text-overlay-foreground"
                    >
                      <EllipsisVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    {!photo.isMain && (
                      <DropdownMenuItem onSelect={() => void setMain(photo)}>
                        <Star />
                        Set as main photo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={() => void remove(photo)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}

        {children}
      </div>

      {viewer !== null && photos.length > 0 && (
        <ProfilePhotoViewer
          photos={photos}
          startIndex={viewer}
          onClose={() => setViewer(null)}
          owner={{ onSetMain: (photo) => void setMain(photo), onDelete: (photo) => void remove(photo) }}
        />
      )}
      {element}
    </>
  );
}

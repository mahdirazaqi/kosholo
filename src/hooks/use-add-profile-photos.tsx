"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { addProfilePhotos } from "@/app/(app)/profile-photo-actions";
import { PhotoCropper } from "@/components/profile/photo-cropper";
import { uploadFile } from "@/lib/media/client/upload";
import { MAX_PROFILE_PHOTOS, MEDIA_ERRORS, PROFILE_PHOTO_MAX_BYTES } from "@/lib/media/limits";
import type { ProfilePhotoItem } from "@/lib/types/profile";

// "Add photo": a multi-select file picker (the camera on phones), a crop step
// per image, uploads with progress, then one addProfilePhotos call so the first
// photo you chose becomes the main one. A failed photo doesn't block the rest.
export function useAddProfilePhotos({
  count,
  onPhotos,
}: {
  count: number; // photos already in the gallery
  onPhotos: (photos: ProfilePhotoItem[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; fraction: number } | null>(null);

  function pick() {
    input.current?.click();
  }

  function onChosen(list: FileList | null) {
    const chosen = Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
    if (chosen.length === 0) return;
    if (count + chosen.length > MAX_PROFILE_PHOTOS) {
      return void toast.error(`You can have up to ${MAX_PROFILE_PHOTOS} profile photos`);
    }
    setFiles(chosen);
  }

  async function upload(blobs: (Blob | null)[]) {
    setFiles(null);
    const ids: string[] = [];
    const total = blobs.length;
    for (const [index, blob] of blobs.entries()) {
      setProgress({ done: index, total, fraction: 0 });
      if (!blob) {
        toast.error(`Photo ${index + 1}: couldn't read this image`);
        continue;
      }
      if (blob.size > PROFILE_PHOTO_MAX_BYTES) {
        toast.error(`Photo ${index + 1}: ${MEDIA_ERRORS.tooLarge("AVATAR")}`);
        continue;
      }
      try {
        const media = await uploadFile(blob, "AVATAR", {
          profile: true,
          filename: "profile.jpg",
          onProgress: (fraction) => setProgress({ done: index, total, fraction }),
        });
        ids.push(media.id);
      } catch (error) {
        toast.error(`Photo ${index + 1}: ${error instanceof Error ? error.message : "couldn't upload"}`);
      }
    }
    setProgress(null);
    if (ids.length === 0) return;
    const result = await addProfilePhotos(ids).catch(() => null);
    if (!result) return void toast.error("Couldn't save the photos, please try again");
    if (!result.ok) return void toast.error(result.error);
    onPhotos(result.photos);
    toast.success(ids.length === 1 ? "Photo added" : `${ids.length} photos added`);
  }

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          onChosen(event.target.files);
          event.target.value = "";
        }}
      />
      {files && <PhotoCropper files={files} onDone={(blobs) => void upload(blobs)} onCancel={() => setFiles(null)} />}
    </>
  );

  return { pick, element, progress };
}

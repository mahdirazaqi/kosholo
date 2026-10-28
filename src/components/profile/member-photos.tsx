"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getProfilePhotos } from "@/app/(app)/profile-photo-actions";
import { ProfilePhotoViewer } from "@/components/profile/photo-viewer";
import type { ProfilePhotoItem } from "@/lib/types/profile";

// "View photos" for a member in a group or a channel's admin list: fetches the
// gallery (the server only answers if I may see it) and opens the viewer.
export function useMemberPhotos() {
  const [photos, setPhotos] = useState<ProfilePhotoItem[] | null>(null);

  async function open(userId: string) {
    const result = await getProfilePhotos(userId).catch(() => null);
    if (!result || result.length === 0) return void toast("No profile photos");
    setPhotos(result);
  }

  const element = photos && <ProfilePhotoViewer photos={photos} startIndex={0} onClose={() => setPhotos(null)} />;
  return { open, element };
}

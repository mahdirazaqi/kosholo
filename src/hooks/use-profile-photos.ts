"use client";

import { useEffect, useRef, useState } from "react";
import { getProfilePhotos } from "@/app/(app)/profile-photo-actions";
import { useRealtimeStore } from "@/lib/realtime/client/store";
import type { ProfilePhotoItem } from "@/lib/types/profile";

// A user's gallery, kept live: when user:updated bumps their photosVersion
// (they added, reordered or deleted photos) it is refetched from the server.
export function useProfilePhotos(userId: string, initial: ProfilePhotoItem[]) {
  const [photos, setPhotos] = useState(initial);
  const version = useRealtimeStore((state) => state.photosVersions[userId]);
  const seen = useRef(version);

  useEffect(() => {
    if (version === undefined || version === seen.current) return;
    seen.current = version;
    let cancelled = false;
    getProfilePhotos(userId)
      .then((next) => !cancelled && next && setPhotos(next))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version, userId]);

  return [photos, setPhotos] as const;
}

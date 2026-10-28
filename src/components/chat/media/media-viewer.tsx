"use client";

import dynamic from "next/dynamic";
import { Bookmark } from "lucide-react";
import type { ChatLocation } from "@/lib/types/chat";

export type ViewerTarget =
  | {
      kind: "image" | "video";
      url: string;
      width: number | null;
      height: number | null;
      messageId?: string; // closes the viewer if that message is deleted
    }
  | { kind: "location"; location: ChatLocation; messageId?: string }
  | null;

// The lightbox, the video player and the map are only downloaded when first opened.
const ImageViewer = dynamic(() => import("@/components/chat/media/image-viewer"), { ssr: false });
const VideoPlayer = dynamic(() => import("@/components/chat/media/video-player"), { ssr: false });
const LocationViewer = dynamic(() => import("@/components/chat/location/location-viewer"), { ssr: false });

export function MediaViewer({
  target,
  onClose,
  onSave,
}: {
  target: ViewerTarget;
  onClose: () => void;
  onSave?: () => void; // "Save" to Saved Messages
}) {
  if (!target) return null;
  const viewer =
    target.kind === "location" ? (
      <LocationViewer location={target.location} onClose={onClose} />
    ) : target.kind === "image" ? (
      <ImageViewer target={target} onClose={onClose} />
    ) : (
      <VideoPlayer target={target} onClose={onClose} />
    );
  return (
    <>
      {viewer}
      {onSave && (
        // Above the lightbox / player, at the inline start (its toolbar is at the end).
        <button
          type="button"
          onClick={onSave}
          className="fixed start-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[10001] flex h-11 items-center gap-2 rounded-full bg-black/60 px-4 text-sm font-medium text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Bookmark className="size-4.5" />
          Save
        </button>
      )}
    </>
  );
}

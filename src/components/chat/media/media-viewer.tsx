"use client";

import dynamic from "next/dynamic";
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

export function MediaViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  if (!target) return null;
  if (target.kind === "location") return <LocationViewer location={target.location} onClose={onClose} />;
  return target.kind === "image" ? (
    <ImageViewer target={target} onClose={onClose} />
  ) : (
    <VideoPlayer target={target} onClose={onClose} />
  );
}

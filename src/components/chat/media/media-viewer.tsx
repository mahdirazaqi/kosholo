"use client";

import dynamic from "next/dynamic";

export type ViewerTarget = {
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
  messageId?: string; // closes the viewer if that message is deleted
} | null;

// The lightbox and the video player are only downloaded when first opened.
const ImageViewer = dynamic(() => import("@/components/chat/media/image-viewer"), { ssr: false });
const VideoPlayer = dynamic(() => import("@/components/chat/media/video-player"), { ssr: false });

export function MediaViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  if (!target) return null;
  return target.kind === "image" ? (
    <ImageViewer target={target} onClose={onClose} />
  ) : (
    <VideoPlayer target={target} onClose={onClose} />
  );
}

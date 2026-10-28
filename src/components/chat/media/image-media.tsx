"use client";

import { MediaFrame } from "@/components/chat/media/media-frame";
import { UploadProgress } from "@/components/chat/media/upload-progress";
import type { ChatMessage } from "@/lib/types/chat";

export function ImageMedia({
  message,
  overlay,
  onOpen,
  onCancel,
}: {
  message: ChatMessage;
  overlay?: React.ReactNode; // time pill when there's no caption
  onOpen: () => void;
  onCancel: () => void;
}) {
  const media = message.media!;
  // Animated GIFs show the original; others the 480px thumbnail (full size in the viewer).
  const src = media.mime === "image/gif" ? media.url : (media.thumbUrl ?? media.url);

  return (
    <MediaFrame width={media.width} height={media.height} placeholder={media.placeholder} src={src} alt="Photo">
      {message.local ? (
        <UploadProgress upload={message.local} onCancel={onCancel} />
      ) : (
        <button type="button" aria-label="View photo" onClick={onOpen} className="absolute inset-0" />
      )}
      {overlay}
    </MediaFrame>
  );
}

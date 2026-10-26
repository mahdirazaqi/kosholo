import type { ChatMedia, UploadKind } from "@/lib/types/chat";

export const mediaUrl = (uploadId: string) => `/api/media/${uploadId}`;
export const mediaThumbUrl = (uploadId: string) => `/api/media/${uploadId}/thumb`;

// "/api/media/{id}" (User.avatarUrl / Conversation.avatarUrl) → "{id}".
export function uploadIdFromUrl(url: string | null | undefined) {
  const match = url?.match(/^\/api\/media\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// Avatars are stored as /api/media/{id}; components show the 128px thumb.
export function avatarThumbUrl(avatarUrl: string | null | undefined) {
  const id = uploadIdFromUrl(avatarUrl);
  return id ? mediaThumbUrl(id) : (avatarUrl ?? null);
}

type UploadRow = {
  id: string;
  kind: UploadKind;
  thumbPath: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  placeholder: string | null;
  waveform: unknown;
};

export function toChatMedia(upload: UploadRow): ChatMedia {
  return {
    id: upload.id,
    kind: upload.kind,
    url: mediaUrl(upload.id),
    thumbUrl: upload.thumbPath ? mediaThumbUrl(upload.id) : null,
    mime: upload.mime,
    width: upload.width,
    height: upload.height,
    duration: upload.duration,
    placeholder: upload.placeholder,
    waveform: Array.isArray(upload.waveform) ? (upload.waveform as number[]) : null,
  };
}

// Fields to select for toChatMedia (never the on-disk path).
export const chatMediaSelect = {
  id: true,
  kind: true,
  thumbPath: true,
  mime: true,
  width: true,
  height: true,
  duration: true,
  placeholder: true,
  waveform: true,
} as const;

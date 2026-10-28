// Upload limits, shared by the client (early checks) and the server (authority).
import type { UploadKind } from "@/lib/types/chat";
import { formatBytes, formatNumber } from "@/lib/numbers";

const MB = 1024 * 1024;

// FILE (documents, "send without compression"): original bytes, any type.
// MAX_FILE_SIZE_MB is read by the server at runtime (lib/upload/server.ts,
// the authority); this build-time copy (next.config.ts → NEXT_PUBLIC_) only
// lets the client refuse oversized files before uploading.
export const MAX_FILE_SIZE = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB || 2048) * MB;

export const UPLOAD_LIMITS: Record<UploadKind, number> = {
  IMAGE: 10 * MB,
  VIDEO: 50 * MB,
  VOICE: 10 * MB,
  AVATAR: 5 * MB,
  FILE: MAX_FILE_SIZE,
};

// Resumable FILE uploads (see lib/upload/protocol.ts).
export const FILE_CHUNK_SIZE = 8 * MB;
export const MAX_ACTIVE_UPLOAD_SESSIONS = 3; // per user
export const FILE_BYTES_PER_HOUR = 10 * 1024 * MB; // per user
export const DISK_HEADROOM = 2 * 1024 * MB; // free space that must remain after an upload
export const MAX_FILE_NAME_LENGTH = 255;
export const FILE_THUMB_MAX_SOURCE = 50 * MB; // FILE images bigger than this get no thumbnail

// Real types (detected from magic bytes on the server).
export const ACCEPTED_MIME: Record<UploadKind, string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
  // MediaRecorder output (webm/opus in Chrome/Firefox, mp4/aac in Safari) and common audio files.
  VOICE: ["audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/x-m4a", "audio/ogg", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav"],
  AVATAR: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  FILE: [], // anything
};

// Profile photos (AVATAR uploads with `profile=1`): JPEG/PNG/WebP, square.
export const MAX_PROFILE_PHOTOS = 30; // per user
export const PROFILE_PHOTO_MAX_BYTES = 10 * MB;
export const PROFILE_PHOTO_FULL = 1280; // viewer
export const PROFILE_PHOTO_MEDIUM = 640; // profile header
export const PROFILE_PHOTO_THUMB = 160; // avatars everywhere

export const MAX_FILES_PER_SELECTION = 10;
export const MAX_VOICE_SECONDS = 5 * 60;
export const MIN_VOICE_SECONDS = 1;
export const MAX_CAPTION_LENGTH = 1000;
export const WAVEFORM_BARS = 48;
// Uploads per user per window (shared limiter).
export const UPLOAD_RATE = { max: 60, windowMs: 10 * 60 * 1000 } as const;

const megabytes = (bytes: number) => formatNumber(Math.round(bytes / MB));

export const MEDIA_ERRORS = {
  tooLarge: (kind: UploadKind) =>
    kind === "FILE" ? `Max file size is ${formatBytes(MAX_FILE_SIZE)}` : `File is larger than ${megabytes(UPLOAD_LIMITS[kind])} MB`,
  unsupported: "This file type isn't supported",
  tooLong: "Voice messages can be up to 5 minutes long",
  tooShort: "Voice message is too short",
  processing: "Couldn't process the file",
  timeout: "Processing took too long; send a shorter or smaller file",
  empty: "No file selected",
  tooMany: `You can send up to ${formatNumber(MAX_FILES_PER_SELECTION)} files at once`,
  fileTooLarge: (max: number = MAX_FILE_SIZE) => `Max file size is ${formatBytes(max)}`,
  noSpace: "Not enough space on the server",
  tooManyUploads: `You can upload up to ${formatNumber(MAX_ACTIVE_UPLOAD_SESSIONS)} files at a time`,
  hourlyQuota: "You've reached the upload limit for this hour; try again later",
} as const;

// Coarse client-side kind from the browser's MIME (the server re-detects).
export function guessKind(mime: string): "IMAGE" | "VIDEO" | null {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return null;
}

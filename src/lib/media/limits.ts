// Upload limits, shared by the client (early checks) and the server (authority).
import type { UploadKind } from "@/lib/types/chat";
import { toFaDigits } from "@/lib/digits";

const MB = 1024 * 1024;

export const UPLOAD_LIMITS: Record<UploadKind, number> = {
  IMAGE: 10 * MB,
  VIDEO: 50 * MB,
  VOICE: 10 * MB,
  AVATAR: 5 * MB,
};

// Real types (detected from magic bytes on the server).
export const ACCEPTED_MIME: Record<UploadKind, string[]> = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
  // MediaRecorder output (webm/opus in Chrome/Firefox, mp4/aac in Safari) and common audio files.
  VOICE: ["audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/x-m4a", "audio/ogg", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav"],
  AVATAR: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

export const MAX_FILES_PER_SELECTION = 10;
export const MAX_VOICE_SECONDS = 5 * 60;
export const MIN_VOICE_SECONDS = 1;
export const MAX_CAPTION_LENGTH = 1000;
export const WAVEFORM_BARS = 48;
// Uploads per user per window (shared limiter).
export const UPLOAD_RATE = { max: 60, windowMs: 10 * 60 * 1000 } as const;

const persianMb = (bytes: number) => toFaDigits(Math.round(bytes / MB));

export const MEDIA_ERRORS = {
  tooLarge: (kind: UploadKind) => `حجم فایل بیشتر از ${persianMb(UPLOAD_LIMITS[kind])} مگابایت است`,
  unsupported: "این نوع فایل پشتیبانی نمی‌شود",
  tooLong: "پیام صوتی حداکثر می‌تواند ۵ دقیقه باشد",
  tooShort: "پیام صوتی خیلی کوتاه است",
  processing: "پردازش فایل انجام نشد",
  timeout: "پردازش فایل بیش از حد طول کشید؛ فایل کوتاه‌تر یا کم‌حجم‌تری بفرستید",
  empty: "فایلی انتخاب نشده است",
  tooMany: `حداکثر ${toFaDigits(MAX_FILES_PER_SELECTION)} فایل را می‌توانید یک‌جا بفرستید`,
} as const;

// Coarse client-side kind from the browser's MIME (the server re-detects).
export function guessKind(mime: string): "IMAGE" | "VIDEO" | null {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return null;
}

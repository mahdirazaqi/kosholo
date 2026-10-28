import "server-only";

import { copyFile, rm, stat } from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { ffmpeg, FfmpegTimeoutError, ffprobe } from "@/lib/media/ffmpeg";
import { ACCEPTED_MIME, FILE_THUMB_MAX_SOURCE, PROFILE_PHOTO_FULL, PROFILE_PHOTO_MEDIUM, PROFILE_PHOTO_THUMB, MAX_VOICE_SECONDS, MEDIA_ERRORS, WAVEFORM_BARS } from "@/lib/media/limits";
import { newFilePath, removeFiles, tempFilePath } from "@/lib/media/storage";
import type { UploadKind } from "@/lib/types/chat";
import { logger } from "@/lib/logger";

export class MediaError extends Error {}

export type ProcessedUpload = {
  path: string;
  thumbPath: string | null;
  mediumPath?: string | null; // profile photos only
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  placeholder: string | null;
  waveform: number[] | null;
};

const MAX_IMAGE_SIDE = 2048;
const THUMB_SIDE = 480;
const MAX_VIDEO_SIDE = 1280;

// Real type from magic bytes; the browser's MIME and the extension are ignored.
export async function detectType(file: string, kind: UploadKind) {
  const type = await fileTypeFromFile(file);
  if (!type || !ACCEPTED_MIME[kind].includes(type.mime)) throw new MediaError(MEDIA_ERRORS.unsupported);
  return type;
}

async function placeholderFrom(input: string | Buffer) {
  const buffer = await sharp(input).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

async function thumbnail(input: string | Buffer, id: string, side = THUMB_SIDE, cover = false) {
  const thumb = await newFilePath("webp", id, ".thumb");
  await sharp(input)
    .rotate()
    .resize(side, side, cover ? { fit: "cover", position: "centre" } : { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(thumb.absolute);
  return thumb.relative;
}

export async function processImage(tmp: string, id: string): Promise<ProcessedUpload> {
  const type = await detectType(tmp, "IMAGE");

  if (type.mime === "image/gif") {
    // Keep animated GIFs as they are.
    const out = await newFilePath("gif", id);
    await copyFile(tmp, out.absolute);
    const meta = await sharp(tmp, { animated: true }).metadata();
    return {
      path: out.relative,
      thumbPath: await thumbnail(tmp, id),
      mime: "image/gif",
      size: (await stat(out.absolute)).size,
      width: meta.width ?? null,
      height: meta.pageHeight ?? meta.height ?? null,
      duration: null,
      placeholder: await placeholderFrom(tmp),
      waveform: null,
    };
  }

  // Auto-rotate (EXIF), strip metadata (sharp's default), cap the size, WebP.
  const out = await newFilePath("webp", id);
  const info = await sharp(tmp)
    .rotate()
    .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(out.absolute);
  return {
    path: out.relative,
    thumbPath: await thumbnail(out.absolute, id),
    mime: "image/webp",
    size: info.size,
    width: info.width,
    height: info.height,
    duration: null,
    placeholder: await placeholderFrom(out.absolute),
    waveform: null,
  };
}

export async function processVideo(tmp: string, id: string): Promise<ProcessedUpload> {
  const type = await detectType(tmp, "VIDEO");
  const probe = await ffprobe(tmp).catch(() => null);
  if (!probe?.video) throw new MediaError(MEDIA_ERRORS.unsupported);

  const out = await newFilePath("mp4", id);
  const alreadyPlayable =
    probe.video.codec === "h264" &&
    (!probe.audio || probe.audio.codec === "aac") &&
    (type.mime === "video/mp4" || type.mime === "video/x-m4v");
  try {
    if (alreadyPlayable) {
      // Only move the index to the front so playback starts before the download ends.
      await ffmpeg(["-i", tmp, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", out.absolute]);
    } else {
      // e.g. HEVC .mov from iPhone, WebM: H.264/AAC MP4, longest side ≤ 1280.
      const scale = `scale='if(gte(iw,ih),min(${MAX_VIDEO_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_VIDEO_SIDE},ih))'`;
      await ffmpeg([
        "-i", tmp, "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out.absolute,
      ]);
    }
  } catch (error) {
    await removeFiles(out.relative);
    logger.error("media", "video processing failed", error);
    throw new MediaError(error instanceof FfmpegTimeoutError ? MEDIA_ERRORS.timeout : MEDIA_ERRORS.processing);
  }

  const final = await ffprobe(out.absolute);
  const rotated = final.video && (final.video.rotation === 90 || final.video.rotation === 270);
  const width = final.video ? (rotated ? final.video.height : final.video.width) : null;
  const height = final.video ? (rotated ? final.video.width : final.video.height) : null;

  // Poster frame from ~1s (ffmpeg applies rotation when decoding).
  const poster = await tempFilePath("png");
  try {
    const at = final.duration && final.duration < 2 ? final.duration / 2 : 1;
    await ffmpeg(["-ss", String(at), "-i", out.absolute, "-frames:v", "1", poster]);
    return {
      path: out.relative,
      thumbPath: await thumbnail(poster, id),
      mime: "video/mp4",
      size: (await stat(out.absolute)).size,
      width,
      height,
      duration: final.duration,
      placeholder: await placeholderFrom(poster),
      waveform: null,
    };
  } finally {
    await rm(poster, { force: true });
  }
}

export async function processVoice(tmp: string, id: string, waveform: unknown): Promise<ProcessedUpload> {
  await detectType(tmp, "VOICE");
  const probe = await ffprobe(tmp).catch(() => null);
  if (!probe?.audio) throw new MediaError(MEDIA_ERRORS.unsupported);

  // AAC in M4A plays everywhere, including iOS Safari.
  const out = await newFilePath("m4a", id);
  try {
    await ffmpeg(["-i", tmp, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", out.absolute]);
  } catch (error) {
    await removeFiles(out.relative);
    logger.error("media", "voice processing failed", error);
    throw new MediaError(error instanceof FfmpegTimeoutError ? MEDIA_ERRORS.timeout : MEDIA_ERRORS.processing);
  }
  const final = await ffprobe(out.absolute);
  const duration = final.duration ?? 0;
  if (duration > MAX_VOICE_SECONDS + 1 || duration < 0.5) {
    await removeFiles(out.relative);
    throw new MediaError(duration < 0.5 ? MEDIA_ERRORS.tooShort : MEDIA_ERRORS.tooLong);
  }
  return {
    path: out.relative,
    thumbPath: null,
    mime: "audio/mp4",
    size: (await stat(out.absolute)).size,
    width: null,
    height: null,
    duration,
    placeholder: null,
    waveform: normalizeWaveform(waveform),
  };
}

export async function processAvatar(tmp: string, id: string): Promise<ProcessedUpload> {
  await detectType(tmp, "AVATAR");
  const out = await newFilePath("webp", id);
  const info = await sharp(tmp)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(out.absolute);
  return {
    path: out.relative,
    thumbPath: await thumbnail(out.absolute, id, 128, true),
    mime: "image/webp",
    size: info.size,
    width: info.width,
    height: info.height,
    duration: null,
    placeholder: await placeholderFrom(out.absolute),
    waveform: null,
  };
}

// Profile photo: square (the client crops, this centers if it didn't), EXIF
// auto-rotated and stripped, three WebP sizes (1280 full / 640 header / 160
// thumb) and a tiny blur placeholder. JPEG/PNG/WebP only (no animated GIFs).
export async function processProfilePhoto(tmp: string, id: string): Promise<ProcessedUpload> {
  const type = await detectType(tmp, "AVATAR");
  if (type.mime === "image/gif") throw new MediaError(MEDIA_ERRORS.unsupported);
  const meta = await sharp(tmp).rotate().metadata();
  const shortSide = Math.min(meta.width ?? PROFILE_PHOTO_FULL, meta.height ?? PROFILE_PHOTO_FULL);
  const full = Math.min(PROFILE_PHOTO_FULL, shortSide);
  const make = async (side: number, suffix: string, quality: number) => {
    const out = await newFilePath("webp", id, suffix);
    const info = await sharp(tmp)
      .rotate() // applies EXIF orientation; metadata is dropped on output
      .resize(side, side, { fit: "cover", position: "centre" })
      .webp({ quality })
      .toFile(out.absolute);
    return { out, info };
  };
  const main = await make(full, "", 84);
  const medium = await make(Math.min(PROFILE_PHOTO_MEDIUM, full), ".medium", 80);
  const thumb = await make(Math.min(PROFILE_PHOTO_THUMB, full), ".thumb", 75);
  return {
    path: main.out.relative,
    mediumPath: medium.out.relative,
    thumbPath: thumb.out.relative,
    mime: "image/webp",
    size: main.info.size,
    width: main.info.width,
    height: main.info.height,
    duration: null,
    placeholder: await placeholderFrom(thumb.out.absolute),
    waveform: null,
  };
}

// Client-computed peaks: validate and resample to WAVEFORM_BARS values in 0–1.
function normalizeWaveform(input: unknown): number[] {
  let values: number[] = [];
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (Array.isArray(parsed)) values = parsed.slice(0, 512).map(Number).filter(Number.isFinite);
  } catch {
    // fall through to the flat default
  }
  if (values.length === 0) return Array(WAVEFORM_BARS).fill(0.15);
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const start = Math.floor((i * values.length) / WAVEFORM_BARS);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / WAVEFORM_BARS));
    const peak = Math.max(...values.slice(start, end));
    bars.push(Math.round(Math.min(1, Math.max(0.05, peak)) * 100) / 100);
  }
  return bars;
}

// FILE uploads are never processed: the original bytes are served as they
// arrived. If the file is an image sharp can read (and not huge), a WebP
// thumbnail for the bubble is made from it; the original is left untouched.
// Returns null when there's nothing to show (not an image, too big, unreadable).
export async function fileThumbnail(absolute: string, size: number, mime: string, id: string) {
  if (!mime.startsWith("image/") || mime === "image/svg+xml" || size > FILE_THUMB_MAX_SOURCE) return null;
  try {
    const meta = await sharp(absolute).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    return {
      thumbPath: await thumbnail(absolute, id),
      width: (rotated ? meta.height : meta.width) ?? null,
      height: (rotated ? meta.width : (meta.pageHeight ?? meta.height)) ?? null,
      placeholder: await placeholderFrom(absolute),
    };
  } catch (error) {
    logger.warn("media", "file thumbnail skipped", error);
    return null;
  }
}

"use client";

import { guessKind, MEDIA_ERRORS, UPLOAD_LIMITS } from "@/lib/media/limits";

const MAX_SIDE = 2048;

export type PreparedFile = {
  file: File;
  kind: "IMAGE" | "VIDEO";
  previewUrl: string; // object URL; revoke when done
  width: number | null;
  height: number | null;
  duration: number | null;
};

// Downscale photos before upload (longest side ≤ 2048, JPEG 0.85) to save
// mobile data. GIFs are kept (animation); failures fall back to the original.
async function downscaleImage(file: File): Promise<{ file: File; width: number | null; height: number | null }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;
    if (file.type === "image/gif") {
      bitmap.close();
      return { file, width, height };
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || (scale === 1 && blob.size >= file.size)) return { file, width: w, height: h };
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { file: new File([blob], name, { type: "image/jpeg" }), width: w, height: h };
  } catch {
    return { file, width: null, height: null };
  }
}

function videoMetadata(url: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (value: { width: number | null; height: number | null; duration: number | null }) => {
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? video.duration : null,
      });
    video.onerror = () => done({ width: null, height: null, duration: null });
    video.src = url;
  });
}

// Validates and prepares one selected file; throws a Persian message on rejection.
export async function prepareFile(file: File): Promise<PreparedFile> {
  const kind = guessKind(file.type) ?? (/\.(mov|mp4|m4v|webm)$/i.test(file.name) ? "VIDEO" : null);
  if (!kind) throw new Error(MEDIA_ERRORS.unsupported);

  if (kind === "IMAGE") {
    const prepared = await downscaleImage(file);
    if (prepared.file.size > UPLOAD_LIMITS.IMAGE) throw new Error(MEDIA_ERRORS.tooLarge("IMAGE"));
    return { ...prepared, kind, previewUrl: URL.createObjectURL(prepared.file), duration: null };
  }

  if (file.size > UPLOAD_LIMITS.VIDEO) throw new Error(MEDIA_ERRORS.tooLarge("VIDEO"));
  const previewUrl = URL.createObjectURL(file);
  return { file, kind, previewUrl, ...(await videoMetadata(previewUrl)) };
}

"use client";

import type { ChatMedia, UploadKind } from "@/lib/types/chat";

export class UploadAbortedError extends Error {}

// POST /api/upload with XMLHttpRequest for progress events and abort.
// onProgress gets 0–1 for the request body; the server then processes the
// file (onUploaded marks that phase) before answering with the media object.
export function uploadFile(
  file: Blob,
  kind: UploadKind,
  options: {
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
    onUploaded?: () => void;
    extra?: Record<string, string>;
    filename?: string;
    profile?: boolean; // AVATAR uploads: a profile photo (gallery sizes, up to 10MB)
  } = {},
): Promise<ChatMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("kind", kind);
    for (const [key, value] of Object.entries(options.extra ?? {})) form.append(key, value);
    form.append("file", file, options.filename ?? (file instanceof File ? file.name : "file"));

    xhr.open("POST", `/api/upload?kind=${kind}${options.profile ? "&profile=1" : ""}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.upload.onload = () => options.onUploaded?.();
    xhr.onload = () => {
      const body = xhr.response as { ok: boolean; media?: ChatMedia; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok && body.media) resolve(body.media);
      else reject(new Error(body?.error ?? "Couldn't send the file"));
    };
    xhr.onerror = () => reject(new Error("Couldn't send the file; check your internet connection"));
    xhr.onabort = () => reject(new UploadAbortedError("aborted"));
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

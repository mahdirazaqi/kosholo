// File names of FILE uploads. Client-safe (no server-only): the server
// sanitizes before storing, the client may use the same rules for display.
import { MAX_FILE_NAME_LENGTH } from "@/lib/media/limits";

export const FALLBACK_FILE_NAME = "File";

// Control characters and Unicode bidi controls (U+202A–U+202E, U+2066–U+2069,
// U+200E/U+200F, U+061C): the latter can make "exe.pdf" look like "fdp.exe".
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g;

// Basename only, no path separators, no control/bidi characters, trimmed,
// at most 255 characters (keeping the extension).
export function sanitizeFileName(input: unknown): string {
  if (typeof input !== "string") return FALLBACK_FILE_NAME;
  let name = input.replace(UNSAFE, "");
  name = name.split(/[/\\]/).pop() ?? "";
  name = name.trim().replace(/^\.+$/, "");
  if (!name) return FALLBACK_FILE_NAME;
  if (name.length > MAX_FILE_NAME_LENGTH) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
    name = name.slice(0, MAX_FILE_NAME_LENGTH - ext.length).trimEnd() + ext;
  }
  return name;
}

// `attachment` with an ASCII fallback for old clients and the RFC 5987 UTF-8
// name, so Persian (and any other) names download correctly.
export function contentDisposition(name: string) {
  const safe = sanitizeFileName(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim() || "file";
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

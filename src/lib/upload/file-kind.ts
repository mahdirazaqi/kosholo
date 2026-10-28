import { File, FileArchive, FileImage, FileMusic, FileSpreadsheet, FileText, FileVideoCamera, type LucideIcon } from "lucide-react";

// Icon and color for a FILE bubble / preview row, from the MIME type and the
// name's extension (the browser's MIME is often empty for documents).
export type FileKind = "pdf" | "doc" | "xls" | "zip" | "audio" | "video" | "image" | "generic";

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", txt: "doc", md: "doc", pages: "doc",
  xls: "xls", xlsx: "xls", ods: "xls", csv: "xls", numbers: "xls",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip", tgz: "zip", bz2: "zip", xz: "zip",
  mp3: "audio", m4a: "audio", ogg: "audio", oga: "audio", opus: "audio", wav: "audio", flac: "audio", aac: "audio",
  mp4: "video", mov: "video", mkv: "video", webm: "video", avi: "video", m4v: "video",
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image", heif: "image", bmp: "image", tiff: "image", svg: "image",
};

export function fileKind(mime: string | null | undefined, name: string | null | undefined): FileKind {
  const ext = name?.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  const type = mime ?? "";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  if (/zip|compressed|x-tar|x-7z|x-rar/.test(type)) return "zip";
  if (/spreadsheet|excel|csv/.test(type)) return "xls";
  if (/word|document|text\//.test(type)) return "doc";
  return "generic";
}

export const FILE_KIND_STYLE: Record<FileKind, { icon: LucideIcon; className: string }> = {
  pdf: { icon: FileText, className: "bg-red-500 text-white" },
  doc: { icon: FileText, className: "bg-blue-500 text-white" },
  xls: { icon: FileSpreadsheet, className: "bg-emerald-600 text-white" },
  zip: { icon: FileArchive, className: "bg-amber-500 text-white" },
  audio: { icon: FileMusic, className: "bg-violet-500 text-white" },
  video: { icon: FileVideoCamera, className: "bg-pink-500 text-white" },
  image: { icon: FileImage, className: "bg-sky-500 text-white" },
  generic: { icon: File, className: "bg-slate-500 text-white" },
};

// Audio the browser can play inline (FILE uploads keep their original format).
const PLAYABLE_AUDIO = /^audio\/(mpeg|mp3|mp4|x-m4a|aac|ogg|wav|x-wav|wave|webm|opus|flac)$/;

const playable = new Map<string, boolean>();

export function canPlayAudio(mime: string) {
  if (!PLAYABLE_AUDIO.test(mime) || typeof document === "undefined") return false;
  let result = playable.get(mime);
  if (result === undefined) {
    result = document.createElement("audio").canPlayType(mime) !== "";
    playable.set(mime, result);
  }
  return result;
}

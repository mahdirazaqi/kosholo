import { formatDuration } from "@/lib/format-date";
import type { MessageType } from "@/lib/types/chat";

const MAX_NAME = 40;

// "a-very-long-report-name….pdf": shortens in the middle, keeping the extension.
export function shortFileName(name: string, max = MAX_NAME) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
  const keep = max - ext.length - 1;
  return `${name.slice(0, Math.ceil(keep * 0.6))}…${name.slice(name.length - ext.length - Math.floor(keep * 0.4), name.length - ext.length)}${ext}`;
}

// One-line text for list previews, quotes and the reply bar. Media get an
// icon + label (voice with its length), followed by the caption if any.
export function previewText(message: {
  type: MessageType;
  content: string | null;
  duration?: number | null;
  fileName?: string | null;
  locationLabel?: string | null;
}) {
  const caption = message.content?.replace(/\s+/g, " ").trim() ?? "";
  switch (message.type) {
    case "TEXT":
      return caption;
    case "IMAGE":
      return caption ? `📷 ${caption}` : "📷 Photo";
    case "VIDEO":
      return caption ? `🎬 ${caption}` : "🎬 Video";
    case "VOICE":
      return `🎤 Voice message${message.duration ? ` (${formatDuration(message.duration)})` : ""}`;
    case "FILE":
      return `📎 ${shortFileName(message.fileName || "File")}`;
    case "LOCATION":
      return message.locationLabel ? `📍 Location: ${message.locationLabel}` : "📍 Location";
    default:
      return "Group event";
  }
}

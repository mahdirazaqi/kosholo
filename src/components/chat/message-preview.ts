import { formatDuration } from "@/lib/format-date";
import type { MessageType } from "@/lib/types/chat";

// One-line text for list previews, quotes and the reply bar. Media get an
// icon + label (voice with its length), followed by the caption if any.
export function previewText(message: {
  type: MessageType;
  content: string | null;
  duration?: number | null;
}) {
  const caption = message.content?.replace(/\s+/g, " ").trim() ?? "";
  switch (message.type) {
    case "TEXT":
      return caption;
    case "IMAGE":
      return caption ? `📷 ${caption}` : "📷 عکس";
    case "VIDEO":
      return caption ? `🎬 ${caption}` : "🎬 ویدیو";
    case "VOICE":
      return `🎤 پیام صوتی${message.duration ? ` (${formatDuration(message.duration)})` : ""}`;
    default:
      return "رویداد گروه";
  }
}

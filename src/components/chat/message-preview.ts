import type { MessageType } from "@/lib/types/chat";

const MEDIA_LABELS: Record<MessageType, string> = {
  TEXT: "پیام",
  IMAGE: "🖼️ تصویر",
  VIDEO: "🎬 ویدیو",
  VOICE: "🎤 پیام صوتی",
  SYSTEM: "رویداد گروه",
};

// One-line text for list previews and quotes; media types get a label.
export function previewText(message: { type: MessageType; content: string | null }) {
  if (message.type === "TEXT") return message.content?.replace(/\s+/g, " ").trim() ?? "";
  return message.content ? `${MEDIA_LABELS[message.type]}: ${message.content}` : MEDIA_LABELS[message.type];
}

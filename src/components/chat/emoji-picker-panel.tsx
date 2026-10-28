"use client";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";

// Emoji data is self-hosted in public/emojibase/en (no CDN; jsDelivr is often
// blocked in some regions).
const EMOJIBASE_URL = "/emojibase";

// Loaded lazily by EmojiButton.
export default function EmojiPickerPanel({
  className,
  columns,
  onPick,
}: {
  className: string;
  columns: number;
  onPick: (emoji: string) => void;
}) {
  return (
    <EmojiPicker
      className={className}
      columns={columns}
      locale="en"
      emojibaseUrl={EMOJIBASE_URL}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
    >
      <EmojiPickerSearch placeholder="Search emoji" aria-label="Search emoji" />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
  );
}

"use client";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";

// Emoji data is self-hosted in public/emojibase (no CDN). emojibase has no
// Persian locale, so search uses English keywords; category names are Persian.
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
      <EmojiPickerSearch placeholder="جستجوی ایموجی" aria-label="جستجوی ایموجی" />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
  );
}

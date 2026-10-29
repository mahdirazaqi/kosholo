// Stable per-id colours (8), from the sender-1 … sender-8 theme tokens, so they
// stay readable in every theme and mode. Used for avatar tints (`tint-N` in
// appearance.css) and group sender names, so a person keeps the same colour everywhere.
// Full class names are spelled out so Tailwind can see them.
const TINTS = ["tint-1", "tint-2", "tint-3", "tint-4", "tint-5", "tint-6", "tint-7", "tint-8"] as const;
const TEXTS = [
  "text-sender-1", "text-sender-2", "text-sender-3", "text-sender-4",
  "text-sender-5", "text-sender-6", "text-sender-7", "text-sender-8",
] as const;

function pick(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % TINTS.length;
}

export const avatarTint = (id: string) => TINTS[pick(id)];
export const nameColor = (id: string) => TEXTS[pick(id)];

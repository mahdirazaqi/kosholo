// Stable per-id colors (8), readable in light and dark mode. Used for avatar
// tints and group sender names, so a person keeps the same color everywhere.
const PALETTE = [
  { tint: "bg-rose-500/15 text-rose-700 dark:text-rose-300", text: "text-rose-600 dark:text-rose-400" },
  { tint: "bg-amber-500/15 text-amber-700 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400" },
  { tint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400" },
  { tint: "bg-sky-500/15 text-sky-700 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400" },
  { tint: "bg-violet-500/15 text-violet-700 dark:text-violet-300", text: "text-violet-600 dark:text-violet-400" },
  { tint: "bg-teal-500/15 text-teal-700 dark:text-teal-300", text: "text-teal-600 dark:text-teal-400" },
  { tint: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300", text: "text-fuchsia-600 dark:text-fuchsia-400" },
  { tint: "bg-orange-500/15 text-orange-700 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400" },
] as const;

function pick(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export const avatarTint = (id: string) => pick(id).tint;
export const nameColor = (id: string) => pick(id).text;

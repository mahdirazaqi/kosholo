import type { SystemMeta } from "@/lib/types/chat";

// English text for a SYSTEM message. "You"/"you" replaces the current user's
// name. `currentNames` (id → name) prefers members' current names; the names
// stored in meta cover people who have left.
export function systemMessageText(
  meta: SystemMeta,
  meId: string | null,
  currentNames?: Map<string, string>,
) {
  const nameOf = (id: string, stored: string | undefined, you: string) =>
    id === meId ? you : (currentNames?.get(id) ?? stored ?? "Someone");
  const actor = nameOf(meta.actorId, meta.actorName, "You");
  const targetIds = meta.targetIds ?? [];
  const targetsAsSubject = joinNames(targetIds.map((id, i) => nameOf(id, meta.targetNames?.[i], "You")));
  const targets = joinNames(targetIds.map((id, i) => nameOf(id, meta.targetNames?.[i], "you")));
  const title = meta.newTitle ?? "";

  switch (meta.event) {
    case "created":
      return `${actor} created the group “${title}”`;
    case "member_added":
      return `${actor} added ${targets}`;
    case "member_removed":
      return `${actor} removed ${targets}`;
    case "member_left":
      return `${actor} left the group`;
    case "renamed":
      return `${actor} renamed the group to “${title}”`;
    case "admin_promoted":
      if (meta.auto) {
        const plural = targetIds.length > 1 || targetIds.includes(meId ?? "");
        return `${targetsAsSubject} ${plural ? "are" : "is"} now ${targetIds.length > 1 ? "admins" : "an admin"}`;
      }
      return `${actor} made ${targets} ${targetIds.length > 1 ? "admins" : "an admin"}`;
    case "photo_changed":
      return meta.removed ? `${actor} removed the group photo` : `${actor} changed the group photo`;
    case "admin_demoted":
      return `${actor} removed ${targets} as admin`;
    case "history_cleared":
      return `${actor} cleared the group history`;
    default:
      return "Group event";
  }
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

// "Jane Doe" → "Jane" (chat list "Jane: …" prefixes).
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

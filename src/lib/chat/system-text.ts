import type { SystemMeta } from "@/lib/types/chat";

// Persian text for a SYSTEM message. «شما» replaces the current user's name
// (with second-person verbs). `currentNames` (id → name) prefers members'
// current names; the names stored in meta cover people who have left.
export function systemMessageText(
  meta: SystemMeta,
  meId: string | null,
  currentNames?: Map<string, string>,
) {
  const nameOf = (id: string, stored: string | undefined) =>
    id === meId ? "شما" : (currentNames?.get(id) ?? stored ?? "کاربر");
  const actorIsMe = meta.actorId === meId;
  const actor = nameOf(meta.actorId, meta.actorName);
  const targetIds = meta.targetIds ?? [];
  const targets = joinNames(targetIds.map((id, i) => nameOf(id, meta.targetNames?.[i])));
  const title = meta.newTitle ?? "";
  // «شما … ساختید» vs «علی … ساخت»
  const verb = (third: string, second: string) => (actorIsMe ? second : third);

  switch (meta.event) {
    case "created":
      return `${actor} گروه «${title}» را ${verb("ساخت", "ساختید")}`;
    case "member_added":
      return `${actor}، ${targets} را به گروه ${verb("اضافه کرد", "اضافه کردید")}`;
    case "member_removed":
      return `${actor}، ${targets} را از گروه ${verb("حذف کرد", "حذف کردید")}`;
    case "member_left":
      return `${actor} گروه را ${verb("ترک کرد", "ترک کردید")}`;
    case "renamed":
      return `${actor} نام گروه را به «${title}» ${verb("تغییر داد", "تغییر دادید")}`;
    case "admin_promoted":
      if (meta.auto) {
        return `${targets} ${targetIds.includes(meId ?? "") ? "ادمین گروه شدید" : "ادمین گروه شد"}`;
      }
      return `${actor}، ${targets} را ادمین ${verb("کرد", "کردید")}`;
    case "admin_demoted":
      return `${actor}، ${targets} را از ادمینی ${verb("برداشت", "برداشتید")}`;
    default:
      return "رویداد گروه";
  }
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join("، ")} و ${names.at(-1)}`;
}

// "علی رضایی" → "علی" (chat list "علی: …" prefixes).
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

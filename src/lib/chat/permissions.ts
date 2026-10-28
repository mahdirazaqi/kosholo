import type { ConversationType, MemberRole, MessageType } from "@/lib/types/chat";

// Deletion permissions, shared by the server (the authority, lib/chat/delete.ts)
// and the client (which only uses them to decide what to offer).
//
// | Action                        | DIRECT              | GROUP                          |
// |-------------------------------|---------------------|--------------------------------|
// | Delete message for me         | any visible message | any visible message            |
// | Delete message for everyone   | any non-system      | own non-system; admins: any    |
// | Clear history for me          | either member       | any member                     |
// | Clear history for everyone    | either member       | admins                         |
// | Delete chat for me/everyone   | either member       | (leave and delete / admin delete group) |
//
// CHANNEL: nobody deletes a post "for me". Admins delete any post for everyone
// and clear the history for everyone; every member can clear it for themselves.
// Channel management lives in the table in CLAUDE.md and lib/chat/channels.ts.

export const MAX_DELETE_MESSAGES = 100;

type Actor = { id: string; role: MemberRole; conversationType: ConversationType };

// "Delete for me" hides one message from one member; channels don't have it.
export const canDeleteForMe = (conversationType: ConversationType) => conversationType !== "CHANNEL";

export function canDeleteForEveryone(actor: Actor, message: { senderId: string; type: MessageType }) {
  if (actor.conversationType === "CHANNEL") return actor.role === "ADMIN";
  if (actor.conversationType === "SAVED") return true; // I'm the only member: always a hard delete
  if (actor.conversationType === "DIRECT") return message.type !== "SYSTEM";
  if (actor.role === "ADMIN") return true;
  return message.type !== "SYSTEM" && message.senderId === actor.id;
}

export function canClearForEveryone(actor: Pick<Actor, "role" | "conversationType">) {
  if (actor.conversationType === "SAVED") return false; // clearing for me already purges everything
  return actor.conversationType === "DIRECT" || actor.role === "ADMIN";
}

// ---- Editing ----
// Only TEXT messages and the captions of IMAGE/VIDEO/FILE can be edited (not
// VOICE, LOCATION, SYSTEM, nor the media itself). DIRECT/GROUP: only the sender,
// within the edit window. CHANNEL: any admin, any time. Subscribers never.
export const EDITABLE_TYPES: readonly MessageType[] = ["TEXT", "IMAGE", "VIDEO", "FILE"];

export type EditBlock = "type" | "forbidden" | "expired" | "forwarded";

export function editBlock(
  actor: { id: string; role: MemberRole; conversationType: ConversationType },
  message: { senderId: string; type: MessageType; createdAt: string | Date; forwarded?: boolean },
  windowHours: number,
  now = Date.now(),
): EditBlock | null {
  if (!EDITABLE_TYPES.includes(message.type)) return "type";
  if (message.forwarded) return "forwarded"; // saved copies are never editable
  // Saved Messages: my own messages, with no time limit.
  if (actor.conversationType === "SAVED") return message.senderId === actor.id ? null : "forbidden";
  if (actor.conversationType === "CHANNEL") return actor.role === "ADMIN" ? null : "forbidden";
  if (message.senderId !== actor.id) return "forbidden";
  return now - new Date(message.createdAt).getTime() > windowHours * 3_600_000 ? "expired" : null;
}

export const EDIT_ERRORS: Record<EditBlock, string> = {
  type: "This kind of message can't be edited",
  forbidden: "You can only edit your own messages",
  expired: "The time to edit this message has passed",
  forwarded: "Saved copies can't be edited",
};

// Channels: only admins post, reply and send typing events.
export const canPost = (conversationType: ConversationType, role: MemberRole) =>
  conversationType !== "CHANNEL" || role === "ADMIN";

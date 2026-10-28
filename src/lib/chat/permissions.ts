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
  if (actor.conversationType === "DIRECT") return message.type !== "SYSTEM";
  if (actor.role === "ADMIN") return true;
  return message.type !== "SYSTEM" && message.senderId === actor.id;
}

export function canClearForEveryone(actor: Pick<Actor, "role" | "conversationType">) {
  return actor.conversationType === "DIRECT" || actor.role === "ADMIN";
}

// Channels: only admins post, reply and send typing events.
export const canPost = (conversationType: ConversationType, role: MemberRole) =>
  conversationType !== "CHANNEL" || role === "ADMIN";

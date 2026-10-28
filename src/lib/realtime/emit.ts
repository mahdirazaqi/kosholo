// Emitting from Server Actions. Delivery is per user (user:{id} rooms) so every
// tab/device of every member gets the event, whether or not the chat is open.
import { getMemberIds, invalidateMembership } from "@/lib/realtime/membership";
import {
  conversationRoom,
  userRoom,
  type ServerToClientEvents,
} from "@/lib/realtime/events";
import type { ConversationRemovedReason } from "@/lib/types/chat";
import { tryGetIO } from "@/server/io";

export async function emitToMembers<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  const io = tryGetIO();
  if (!io) return;
  const memberIds = await getMemberIds(conversationId);
  if (memberIds.length === 0) return;
  io.to(memberIds.map(userRoom)).emit(event, ...args);
}

// Someone is no longer a member: tell their tabs/devices, pull every one of
// their sockets out of the conversation room, and drop the cached member list
// so socket events (typing, join) are rejected from now on.
export function emitRemoved(conversationId: string, userIds: string[], reason: ConversationRemovedReason) {
  invalidateMembership(conversationId);
  const io = tryGetIO();
  if (!io || userIds.length === 0) return;
  const rooms = userIds.map(userRoom);
  io.to(rooms).emit("conversation:removed", { conversationId, reason });
  io.in(rooms).socketsLeave(conversationRoom(conversationId));
}

// To specific users' rooms (e.g. "delete for me" → my other tabs/devices).
export function emitToUsers<E extends keyof ServerToClientEvents>(
  userIds: string[],
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  const io = tryGetIO();
  if (!io || userIds.length === 0) return;
  io.to(userIds.map(userRoom)).emit(event, ...args);
}

// A conversation was hard-deleted: tell its former members (captured before
// the delete), pull their sockets out of the room, drop the cached members.
export function emitConversationDeleted(conversationId: string, memberIds: string[]) {
  invalidateMembership(conversationId);
  const io = tryGetIO();
  if (!io || memberIds.length === 0) return;
  const rooms = memberIds.map(userRoom);
  io.to(rooms).emit("conversation:deleted", { conversationId });
  io.in(rooms).socketsLeave(conversationRoom(conversationId));
}

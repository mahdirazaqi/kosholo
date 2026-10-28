// Emitting from Server Actions. Delivery is per user (user:{id} rooms) so every
// tab/device of every member gets the event, whether or not the chat is open.
import { toMemberView } from "@/lib/chat/channel-view";
import { db } from "@/lib/db";
import { getMembership, invalidateMembership } from "@/lib/realtime/membership";
import {
  conversationRoom,
  userRoom,
  type ServerToClientEvents,
} from "@/lib/realtime/events";
import type { ChatMessage, ConversationRemovedReason } from "@/lib/types/chat";
import { tryGetIO } from "@/server/io";

// Rooms per io.to([...]) call. A 10k-subscriber channel is delivered in
// batches, yielding to the event loop in between so it never blocks.
const FAN_OUT_CHUNK = 500;

export async function emitChunked<E extends keyof ServerToClientEvents>(
  userIds: string[],
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  const io = tryGetIO();
  if (!io || userIds.length === 0) return;
  for (let i = 0; i < userIds.length; i += FAN_OUT_CHUNK) {
    io.to(userIds.slice(i, i + FAN_OUT_CHUNK).map(userRoom)).emit(event, ...args);
    if (i + FAN_OUT_CHUNK < userIds.length) await new Promise((resolve) => setImmediate(resolve));
  }
}

export async function emitToMembers<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  await emitChunked((await getMembership(conversationId)).memberIds, event, ...args);
}

// Admins only (channel member lists, invite changes, typing).
export async function emitToAdmins<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  await emitChunked([...(await getMembership(conversationId)).adminIds], event, ...args);
}

// Channel subscribers: the members who are not admins.
export async function emitToSubscribers<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  const { memberIds, adminIds } = await getMembership(conversationId);
  await emitChunked(memberIds.filter((id) => !adminIds.has(id)), event, ...args);
}

// message:new for every member. In a channel admins get the real author and
// subscribers the channel identity (and the signature, if the channel signs).
// `hiddenQuoteFor`: users who can no longer see the quoted post.
export async function emitMessageNew(
  conversationId: string,
  message: ChatMessage,
  tempId: string | null,
  hiddenQuoteFor: ReadonlySet<string> = new Set(),
) {
  const { type, memberIds, adminIds } = await getMembership(conversationId);
  if (type !== "CHANNEL" && hiddenQuoteFor.size === 0) {
    await emitChunked(memberIds, "message:new", { message, tempId });
    return;
  }

  let memberVersion = message;
  if (type === "CHANNEL") {
    const channel = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, avatarUrl: true, signMessages: true },
    });
    if (!channel) return;
    memberVersion = toMemberView(message, { id: conversationId, ...channel, title: channel.title ?? "Channel" });
  }

  const audiences: { ids: string[]; message: ChatMessage }[] = [];
  for (const [isAdmin, base] of [[true, message], [false, memberVersion]] as const) {
    const ids = memberIds.filter((id) => adminIds.has(id) === isAdmin);
    audiences.push({ ids: ids.filter((id) => !hiddenQuoteFor.has(id)), message: base });
    audiences.push({ ids: ids.filter((id) => hiddenQuoteFor.has(id)), message: { ...base, replyTo: "deleted" } });
  }
  for (const { ids, message: payload } of audiences) await emitChunked(ids, "message:new", { message: payload, tempId });
}

// conversation:read names the reader, so channels (whose subscribers must stay
// anonymous) only tell the reader's own tabs/devices.
export async function emitRead(conversationId: string, userId: string, lastReadAt: string) {
  const payload = { conversationId, userId, lastReadAt };
  if ((await getMembership(conversationId)).type === "CHANNEL") emitToUsers([userId], "conversation:read", payload);
  else await emitToMembers(conversationId, "conversation:read", payload);
}

// Someone is no longer a member: tell their tabs/devices, pull every one of
// their sockets out of the conversation room, and drop the cached member list
// so socket events (typing, join) are rejected from now on.
export function emitRemoved(conversationId: string, userIds: string[], reason: ConversationRemovedReason) {
  invalidateMembership(conversationId);
  const io = tryGetIO();
  if (!io || userIds.length === 0) return;
  for (let i = 0; i < userIds.length; i += FAN_OUT_CHUNK) {
    const rooms = userIds.slice(i, i + FAN_OUT_CHUNK).map(userRoom);
    io.to(rooms).emit("conversation:removed", { conversationId, reason });
    io.in(rooms).socketsLeave(conversationRoom(conversationId));
  }
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
export async function emitConversationDeleted(conversationId: string, memberIds: string[]) {
  invalidateMembership(conversationId);
  const io = tryGetIO();
  if (!io || memberIds.length === 0) return;
  for (let i = 0; i < memberIds.length; i += FAN_OUT_CHUNK) {
    const rooms = memberIds.slice(i, i + FAN_OUT_CHUNK).map(userRoom);
    io.to(rooms).emit("conversation:deleted", { conversationId });
    io.in(rooms).socketsLeave(conversationRoom(conversationId));
    if (i + FAN_OUT_CHUNK < memberIds.length) await new Promise((resolve) => setImmediate(resolve));
  }
}

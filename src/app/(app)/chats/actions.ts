"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getConversations, isMember } from "@/lib/chat/conversations";
import {
  getFirstUnreadId,
  getGoneIds,
  getMessages,
  getMessagesAround,
  getMessagesSince as queryMessagesSince,
} from "@/lib/chat/messages";
import { messageSelect, quoteHiddenFor, toChatMessage, type MessageRow } from "@/lib/chat/queries";
import { canPost } from "@/lib/chat/permissions";
import { getUnreadSummary } from "@/lib/chat/unread";
import { getViewCounts } from "@/lib/chat/views";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { emitMessageNew, emitRead, emitToUsers } from "@/lib/realtime/emit";
import type {
  ChatMessage,
  ConversationListItem,
  MemberReadState,
  MessagesPage,
  UnreadSummary,
} from "@/lib/types/chat";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validations/chat";

const NOT_FOUND = "Chat not found";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AlreadySent extends Error {}

export type SendMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const me = await requireUser();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { conversationId, content, uploadId, location, replyToId, tempId } = parsed.data;

  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return { ok: false, error: NOT_FOUND };
  // Channels: only admins publish (the server is the authority, not the UI).
  if (!canPost(viewer.conversationType, viewer.role)) {
    return { ok: false, error: "Only admins can post in this channel" };
  }

  const limitKey = `send:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.messages)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.messages);

  if (replyToId) {
    const original = await db.message.count({
      where: { AND: [{ id: replyToId, conversationId, type: { not: "SYSTEM" } }, visibleMessageWhere(viewer)] },
    });
    if (!original) return { ok: false, error: "The message you're replying to wasn't found" };
  }

  // Media: the upload must be mine, unused, and a message kind (not an avatar).
  // Uploads can be shared by several messages (saved copies), but only the
  // server-side save path may do that: here an attached upload is rejected.
  let type: "TEXT" | "IMAGE" | "VIDEO" | "VOICE" | "FILE" | "LOCATION" = location ? "LOCATION" : "TEXT";
  if (uploadId) {
    const upload = await db.upload.findFirst({ where: { id: uploadId, ownerId: me.id }, select: { kind: true } });
    if (!upload || upload.kind === "AVATAR") return { ok: false, error: "File not found, please send it again" };
    type = upload.kind;
  }

  const now = new Date();
  let row;
  try {
    row = await db.$transaction(async (tx) => {
      if (uploadId) {
        // Lock the upload row so two concurrent sends can't both attach it.
        await tx.$queryRaw`SELECT id FROM uploads WHERE id = ${uploadId}::uuid FOR UPDATE`;
        if ((await tx.message.count({ where: { uploadId } })) > 0) throw new AlreadySent();
      }
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: me.id,
          type,
          content,
          uploadId,
          replyToId,
          createdAt: now,
          ...(location
            ? { latitude: location.latitude, longitude: location.longitude, locationLabel: location.label }
            : {}),
        },
        select: messageSelect,
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: now } });
      // Sending counts as reading everything before it.
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: me.id } },
        data: { lastReadAt: now },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof AlreadySent) return { ok: false, error: "This file has already been sent" };
    throw error;
  }
  const isChannel = viewer.conversationType === "CHANNEL";
  // A new post has one view: its author.
  const message = isChannel ? { ...toChatMessage(row, viewer), views: 1 } : toChatMessage(row, viewer);

  // Every member's user room, including the sender's other tabs/devices.
  if (isChannel) await emitChannelPost(conversationId, row, message, tempId ?? null);
  else await emitNewMessage(conversationId, row, tempId ?? null);
  await emitRead(conversationId, me.id, now.toISOString());

  // Refreshes the chat list on the next visit (not the current chat screen).
  revalidatePath("/");
  return { ok: true, message };
}

// Channel post: admins get the real author, subscribers the channel identity
// (emitMessageNew). Subscribers who cleared their history past the quoted post
// see "Message unavailable".
async function emitChannelPost(conversationId: string, row: MessageRow, message: ChatMessage, tempId: string | null) {
  const cleared = row.replyTo
    ? await db.conversationMember.findMany({
        where: { conversationId, clearedAt: { gte: row.replyTo.createdAt } },
        select: { userId: true },
      })
    : [];
  await emitMessageNew(conversationId, message, tempId, new Set(cleared.map((member) => member.userId)));
}

// message:new for every member. A quote of a message some members deleted
// for themselves (or cleared) reaches them as "Message unavailable".
async function emitNewMessage(conversationId: string, row: MessageRow, tempId: string | null) {
  if (!row.replyTo) {
    await emitMessageNew(conversationId, toChatMessage(row), tempId);
    return;
  }
  const members = await db.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true, clearedAt: true },
  });
  const hidden = members.filter((member) => quoteHiddenFor(row, member));
  const shown = members.filter((member) => !quoteHiddenFor(row, member));
  emitToUsers(shown.map((member) => member.userId), "message:new", { message: toChatMessage(row), tempId });
  emitToUsers(hidden.map((member) => member.userId), "message:new", {
    message: { ...toChatMessage(row), replyTo: "deleted" },
    tempId,
  });
}

export async function markAsRead(conversationId: string): Promise<void> {
  const me = await requireUser();
  if (!(await isMember(conversationId, me.id))) return;

  const lastReadAt = new Date();
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    data: { lastReadAt },
  });
  await emitRead(conversationId, me.id, lastReadAt.toISOString());
  revalidatePath("/");
}

// Server wins: the whole unread summary (app start, reconnect, tab visible), or
// one conversation's entry. A conversation I'm not in simply isn't there (0).
export async function getUnread(conversationId?: string): Promise<UnreadSummary> {
  const me = await requireUser();
  if (conversationId !== undefined && !UUID.test(conversationId)) return { total: 0, perConversation: {} };
  return getUnreadSummary(me.id, conversationId);
}

// "Read all": every non-muted conversation in one updateMany. Each one with
// unread messages also emits conversation:read, so read receipts and my other
// devices' badges follow.
export async function markAllAsRead(): Promise<{ ok: true; count: number }> {
  const me = await requireUser();
  const before = await getUnreadSummary(me.id);
  const lastReadAt = new Date();
  await db.conversationMember.updateMany({ where: { userId: me.id, muted: false }, data: { lastReadAt } });
  const unreadIds = Object.entries(before.perConversation)
    .filter(([, entry]) => entry.count > 0 && !entry.muted)
    .map(([id]) => id);
  await Promise.all(unreadIds.map((id) => emitRead(id, me.id, lastReadAt.toISOString())));
  revalidatePath("/");
  return { ok: true, count: unreadIds.length };
}

// Mute / unmute for me (every conversation type). Only my own tabs and
// devices hear about it.
export async function setMuted(conversationId: string, muted: boolean): Promise<{ ok: boolean }> {
  const me = await requireUser();
  if (typeof muted !== "boolean" || !(await isMember(conversationId, me.id))) return { ok: false };
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    data: { muted },
  });
  emitToUsers([me.id], "conversation:updated", { conversationId, muted });
  revalidatePath("/");
  return { ok: true };
}

// Channel only, polled every 30s while a channel is open: fresh view counts
// for the posts on screen and the subscriber count. Views are never pushed
// per read, so a busy channel can't cause a fan-out storm.
export async function getChannelStats(
  conversationId: string,
  messageIds: string[],
): Promise<{ views: Record<string, number>; memberCount: number } | null> {
  const me = await requireUser();
  const viewer = await getViewer(conversationId, me.id);
  if (!viewer || viewer.conversationType !== "CHANNEL") return null;
  const ids = Array.isArray(messageIds)
    ? messageIds.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, MAX_KNOWN_IDS)
    : [];
  const [views, memberCount] = await Promise.all([
    getViewCounts(conversationId, ids),
    db.conversationMember.count({ where: { conversationId } }),
  ]);
  return { views, memberCount };
}

// One page of messages (lib/chat/messages.ts has the contract). Exactly one of
// `before` (older than the cursor), `after` (newer than the cursor), `around`
// (the window around a message id) or none (the latest) applies.
export async function loadMessages(
  conversationId: string,
  request: { before?: string; after?: string; around?: string } = {},
): Promise<MessagesPage | null> {
  const me = await requireUser();
  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return null;
  if (request.around !== undefined) {
    if (!UUID.test(request.around)) return null;
    return getMessagesAround(conversationId, viewer, request.around);
  }
  const cursor = request.before ?? request.after;
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 120)) return null;
  return getMessages(conversationId, viewer, { before: request.before, after: request.after });
}

// The first message I hadn't read when the chat was opened (`lastReadAt` is the
// position I had then), to jump to it from the unread button.
export async function getFirstUnreadMessageId(conversationId: string, lastReadAt: string | null): Promise<string | null> {
  const me = await requireUser();
  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return null;
  const since = lastReadAt ? new Date(lastReadAt) : null;
  if (since && Number.isNaN(since.getTime())) return null;
  return getFirstUnreadId(conversationId, viewer, since);
}

const MAX_KNOWN_IDS = 500;

// Catch-up after a reconnect or the tab becoming visible again: missed
// messages, which of the shown messages (`knownIds`) were deleted meanwhile,
// and the other members' current read positions.
export async function getMessagesSince(
  conversationId: string,
  since: string,
  knownIds: string[] = [],
): Promise<{
  messages: ChatMessage[];
  hasMore: boolean;
  goneIds: string[];
  readStates: MemberReadState[];
} | null> {
  const me = await requireUser();
  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return null;
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) return null;
  const ids = Array.isArray(knownIds)
    ? knownIds.filter((id) => typeof id === "string" && UUID.test(id)).slice(-MAX_KNOWN_IDS)
    : [];

  const [result, goneIds, members] = await Promise.all([
    queryMessagesSince(conversationId, viewer, date),
    getGoneIds(conversationId, viewer, ids),
    // Channels: no member data goes to the client.
    viewer.conversationType === "CHANNEL"
      ? Promise.resolve([])
      : db.conversationMember.findMany({
          where: { conversationId, userId: { not: me.id } },
          select: { userId: true, lastReadAt: true, joinedAt: true },
        }),
  ]);
  return {
    ...result,
    goneIds,
    readStates: members.map((m) => ({
      userId: m.userId,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

// One chat-list row, e.g. when someone messages me for the first time.
export async function getConversation(conversationId: string): Promise<ConversationListItem | null> {
  const me = await requireUser();
  const [item] = await getConversations(me.id, conversationId);
  return item ?? null;
}

// The whole chat list, for refreshing after a reconnect.
export async function listConversations(): Promise<ConversationListItem[]> {
  const me = await requireUser();
  return getConversations(me.id);
}

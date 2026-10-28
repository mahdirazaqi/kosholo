"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getConversations, isMember } from "@/lib/chat/conversations";
import { getGoneIds, getMessages, getMessagesSince as queryMessagesSince } from "@/lib/chat/messages";
import { messageSelect, quoteHiddenFor, toChatMessage, type MessageRow } from "@/lib/chat/queries";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { emitToMembers, emitToUsers } from "@/lib/realtime/emit";
import type {
  ChatMessage,
  ConversationListItem,
  MemberReadState,
  MessagesPage,
} from "@/lib/types/chat";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validations/chat";

const NOT_FOUND = "Chat not found";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SendMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const me = await requireUser();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { conversationId, content, uploadId, location, replyToId, tempId } = parsed.data;

  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return { ok: false, error: NOT_FOUND };

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
  let type: "TEXT" | "IMAGE" | "VIDEO" | "VOICE" | "FILE" | "LOCATION" = location ? "LOCATION" : "TEXT";
  if (uploadId) {
    const upload = await db.upload.findFirst({
      where: { id: uploadId, ownerId: me.id, message: null },
      select: { kind: true },
    });
    if (!upload || upload.kind === "AVATAR") return { ok: false, error: "File not found, please send it again" };
    type = upload.kind;
  }

  const now = new Date();
  let row;
  try {
    [row] = await db.$transaction([
      db.message.create({
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
      }),
      db.conversation.update({ where: { id: conversationId }, data: { updatedAt: now } }),
      // Sending counts as reading everything before it.
      db.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: me.id } },
        data: { lastReadAt: now },
      }),
    ]);
  } catch (error) {
    // uploadId is unique: a concurrent send with the same upload lost the race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "This file has already been sent" };
    }
    throw error;
  }
  const message = toChatMessage(row, viewer);

  // Every member's user room, including the sender's other tabs/devices.
  await emitNewMessage(conversationId, row, tempId ?? null);
  await emitToMembers(conversationId, "conversation:read", {
    conversationId,
    userId: me.id,
    lastReadAt: now.toISOString(),
  });

  // Refreshes the chat list on the next visit (not the current chat screen).
  revalidatePath("/");
  return { ok: true, message };
}

// message:new for every member. A quote of a message some members deleted
// for themselves (or cleared) reaches them as "Message unavailable".
async function emitNewMessage(conversationId: string, row: MessageRow, tempId: string | null) {
  if (!row.replyTo) {
    await emitToMembers(conversationId, "message:new", { message: toChatMessage(row), tempId });
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
  await emitToMembers(conversationId, "conversation:read", {
    conversationId,
    userId: me.id,
    lastReadAt: lastReadAt.toISOString(),
  });
  revalidatePath("/");
}

export async function loadOlderMessages(
  conversationId: string,
  cursor: string,
): Promise<MessagesPage | null> {
  const me = await requireUser();
  const viewer = await getViewer(conversationId, me.id);
  if (!viewer) return null;
  if (typeof cursor !== "string" || cursor.length > 100) return null;
  return getMessages(conversationId, viewer, cursor);
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
    db.conversationMember.findMany({
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

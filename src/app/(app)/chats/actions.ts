"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getConversations, isMember } from "@/lib/chat/conversations";
import { getMessages, getMessagesSince as queryMessagesSince } from "@/lib/chat/messages";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { emitToMembers } from "@/lib/realtime/emit";
import type {
  ChatMessage,
  ConversationListItem,
  MemberReadState,
  MessagesPage,
} from "@/lib/types/chat";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validations/chat";

const NOT_FOUND = "گفتگو پیدا نشد";

export type SendMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const me = await requireUser();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { conversationId, content, replyToId, tempId } = parsed.data;

  if (!(await isMember(conversationId, me.id))) return { ok: false, error: NOT_FOUND };

  const limitKey = `send:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.messages)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.messages);

  if (replyToId) {
    const original = await db.message.count({
      where: { id: replyToId, conversationId, type: { not: "SYSTEM" } },
    });
    if (!original) return { ok: false, error: "پیامی که به آن پاسخ می‌دهید پیدا نشد" };
  }

  const now = new Date();
  const [row] = await db.$transaction([
    db.message.create({
      data: { conversationId, senderId: me.id, type: "TEXT", content, replyToId, createdAt: now },
      select: messageSelect,
    }),
    db.conversation.update({ where: { id: conversationId }, data: { updatedAt: now } }),
    // Sending counts as reading everything before it.
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: now },
    }),
  ]);
  const message = toChatMessage(row);

  // Every member's user room, including the sender's other tabs/devices.
  await emitToMembers(conversationId, "message:new", { message, tempId: tempId ?? null });
  await emitToMembers(conversationId, "conversation:read", {
    conversationId,
    userId: me.id,
    lastReadAt: now.toISOString(),
  });

  // Refreshes the chat list on the next visit (not the current chat screen).
  revalidatePath("/");
  return { ok: true, message };
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
  if (!(await isMember(conversationId, me.id))) return null;
  if (typeof cursor !== "string" || cursor.length > 64) return null;

  // An unknown cursor id makes Prisma throw; treat it as "nothing more".
  try {
    return await getMessages(conversationId, cursor);
  } catch {
    return { messages: [], nextCursor: null };
  }
}

// Catch-up after a reconnect or the tab becoming visible again: missed
// messages plus the other members' current read positions.
export async function getMessagesSince(
  conversationId: string,
  since: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean; readStates: MemberReadState[] } | null> {
  const me = await requireUser();
  if (!(await isMember(conversationId, me.id))) return null;
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) return null;

  const [result, members] = await Promise.all([
    queryMessagesSince(conversationId, date),
    db.conversationMember.findMany({
      where: { conversationId, userId: { not: me.id } },
      select: { userId: true, lastReadAt: true, joinedAt: true },
    }),
  ]);
  return {
    ...result,
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

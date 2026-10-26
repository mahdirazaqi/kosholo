import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { conversationSelect, preview, toChatMember, toReadState } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import type { ChatConversation, ConversationListItem, SystemMeta } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// Key that identifies the single DIRECT conversation between two users.
export function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;

function describe(conversation: ConversationRow, userId: string) {
  const otherUser =
    conversation.type === "DIRECT"
      ? (conversation.members.find((member) => member.userId !== userId)?.user ?? null)
      : null;
  return {
    otherUser,
    title: otherUser?.name ?? conversation.title ?? "گفتگو",
    avatarUrl: otherUser?.avatarUrl ?? conversation.avatarUrl,
  };
}

// Membership check used by every chat read/write. Malformed ids count as "not a member".
export async function isMember(conversationId: string, userId: string) {
  if (!userIdSchema.safeParse(conversationId).success) return false;
  const count = await db.conversationMember.count({ where: { conversationId, userId } });
  return count > 0;
}

// Returns the conversation only if `userId` is a member; null otherwise
// (including malformed ids), so callers can respond with a 404.
export async function getConversationForMember(
  conversationId: string,
  userId: string,
): Promise<ChatConversation | null> {
  if (!userIdSchema.safeParse(conversationId).success) return null;

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, members: { some: { userId } } },
    select: conversationSelect,
  });
  if (!conversation) return null;

  return {
    id: conversation.id,
    type: conversation.type,
    members: conversation.members.map(toChatMember),
    memberCount: conversation.members.length,
    readStates: conversation.members.filter((member) => member.userId !== userId).map(toReadState),
    ...describe(conversation, userId),
  };
}

// Conversations the user belongs to that have at least one message, newest first.
// `onlyId` narrows it to one conversation (for inserting a new chat-list row).
export async function getConversations(
  userId: string,
  onlyId?: string,
): Promise<ConversationListItem[]> {
  if (onlyId !== undefined && !userIdSchema.safeParse(onlyId).success) return [];
  const [conversations, unread] = await Promise.all([
    db.conversation.findMany({
      where: {
        ...(onlyId ? { id: onlyId } : {}),
        members: { some: { userId } },
        messages: { some: {} },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        ...conversationSelect,
        updatedAt: true,
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            type: true,
            content: true,
            meta: true,
            createdAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    }),
    getUnreadCounts(userId),
  ]);

  return conversations.map((conversation) => {
    const last = conversation.messages[0];
    return {
      id: conversation.id,
      type: conversation.type,
      ...describe(conversation, userId),
      lastMessage: last
        ? {
            type: last.type,
            content: preview(last.content),
            isMine: last.sender.id === userId,
            senderName: last.sender.name,
            meta: last.type === "SYSTEM" ? (last.meta as SystemMeta | null) : null,
          }
        : null,
      lastMessageAt: (last?.createdAt ?? conversation.updatedAt).toISOString(),
      unreadCount: unread.get(conversation.id) ?? 0,
    };
  });
}

// Messages from others created after the member's lastReadAt, per conversation.
async function getUnreadCounts(userId: string) {
  const rows = await db.$queryRaw<{ conversation_id: string; count: number }[]>(Prisma.sql`
    SELECT m.conversation_id, COUNT(*)::int AS count
    FROM messages m
    JOIN conversation_members cm
      ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}::uuid
    WHERE m.sender_id <> ${userId}::uuid
      AND m.type <> 'SYSTEM'
      AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    GROUP BY m.conversation_id
  `);
  return new Map(rows.map((row) => [row.conversation_id, row.count]));
}

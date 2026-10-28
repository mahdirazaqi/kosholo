import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { conversationSelect, preview, toChatMember, toReadState } from "@/lib/chat/queries";
import { visibleSql } from "@/lib/chat/visibility";
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
    title: otherUser?.name ?? conversation.title ?? "Chat",
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

// Conversations where the user can see at least one message, ordered by their
// newest visible message. `onlyId` narrows it to one conversation (inserting
// or refreshing a chat-list row). A conversation the user cleared drops out
// until a new message arrives.
export async function getConversations(
  userId: string,
  onlyId?: string,
): Promise<ConversationListItem[]> {
  if (onlyId !== undefined && !userIdSchema.safeParse(onlyId).success) return [];

  // Per membership: the newest visible message and the visible unread count.
  const summaries = await db.$queryRaw<
    { conversation_id: string; last_id: string | null; unread: number }[]
  >(Prisma.sql`
    SELECT cm.conversation_id,
      (SELECT m.id FROM messages m
        WHERE m.conversation_id = cm.conversation_id AND ${visibleSql("m", "cm")}
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_id,
      (SELECT COUNT(*)::int FROM messages m
        WHERE m.conversation_id = cm.conversation_id
          AND m.sender_id <> cm.user_id
          AND m.type <> 'SYSTEM'
          AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
          AND ${visibleSql("m", "cm")}) AS unread
    FROM conversation_members cm
    WHERE cm.user_id = ${userId}::uuid
      ${onlyId ? Prisma.sql`AND cm.conversation_id = ${onlyId}::uuid` : Prisma.empty}
  `);
  const visible = summaries.filter((row) => row.last_id !== null);
  if (visible.length === 0) return [];

  const [conversations, lastMessages] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: visible.map((row) => row.conversation_id) } },
      select: conversationSelect,
    }),
    db.message.findMany({
      where: { id: { in: visible.map((row) => row.last_id!) } },
      select: {
        id: true,
        type: true,
        content: true,
        meta: true,
        createdAt: true,
        sender: { select: { id: true, name: true } },
        upload: { select: { duration: true } },
      },
    }),
  ]);
  const conversationById = new Map(conversations.map((row) => [row.id, row]));
  const messageById = new Map(lastMessages.map((row) => [row.id, row]));

  const items: ConversationListItem[] = [];
  for (const summary of visible) {
    const conversation = conversationById.get(summary.conversation_id);
    const last = messageById.get(summary.last_id!);
    if (!conversation || !last) continue; // deleted between the two queries
    items.push({
      id: conversation.id,
      type: conversation.type,
      myRole: conversation.members.find((member) => member.userId === userId)?.role ?? "MEMBER",
      ...describe(conversation, userId),
      lastMessage: {
        type: last.type,
        duration: last.upload?.duration ?? null,
        content: preview(last.content),
        isMine: last.sender.id === userId,
        senderName: last.sender.name,
        meta: last.type === "SYSTEM" ? (last.meta as SystemMeta | null) : null,
      },
      lastMessageAt: last.createdAt.toISOString(),
      unreadCount: summary.unread,
    });
  }
  return items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

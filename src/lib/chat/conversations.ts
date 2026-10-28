import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { editWindowHours } from "@/lib/chat/edit-config";
import { conversationSelectFor, preview, toChatMember, toReadState } from "@/lib/chat/queries";
import { visibleSql } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { ChatConversation, ConversationListItem, SystemMeta } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// Key that identifies the single DIRECT conversation between two users.
export function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

type ConversationRow = Prisma.ConversationGetPayload<{ select: ReturnType<typeof conversationSelectFor> }>;

function describe(conversation: ConversationRow, userId: string) {
  const otherUser =
    conversation.type === "DIRECT"
      ? (conversation.members.find((member) => member.userId !== userId)?.user ?? null)
      : null;
  return {
    otherUser,
    title: conversation.type === "SAVED" ? "Saved Messages" : (otherUser?.name ?? conversation.title ?? "Chat"),
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
    select: conversationSelectFor(userId),
  });
  if (!conversation) return null;

  const me = conversation.members.find((member) => member.userId === userId);
  // Channels and Saved Messages never expose a member list.
  const isChannel = conversation.type === "CHANNEL";
  const hideMembers = isChannel || conversation.type === "SAVED";
  return {
    id: conversation.id,
    type: conversation.type,
    // Channels: the loaded rows are only mine, and no member data goes out.
    members: hideMembers ? [] : conversation.members.map(toChatMember),
    memberCount: conversation._count.members,
    readStates: hideMembers ? [] : conversation.members.filter((member) => member.userId !== userId).map(toReadState),
    myRole: me?.role ?? "MEMBER",
    lastReadAt: me?.lastReadAt?.toISOString() ?? null,
    editWindowHours: editWindowHours(),
    loadedAt: new Date().toISOString(),
    isOwner: isChannel && conversation.ownerId === userId,
    muted: me?.muted ?? false,
    description: conversation.description,
    signMessages: conversation.signMessages,
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

  // Per membership: the newest visible message (unread counts: lib/chat/unread.ts).
  const summaries = await db.$queryRaw<
    { conversation_id: string; last_id: string | null; muted: boolean }[]
  >(Prisma.sql`
    SELECT cm.conversation_id, cm.muted,
      (SELECT m.id FROM messages m
        WHERE m.conversation_id = cm.conversation_id AND ${visibleSql("m", "cm")}
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_id
    FROM conversation_members cm
    WHERE cm.user_id = ${userId}::uuid
      ${onlyId ? Prisma.sql`AND cm.conversation_id = ${onlyId}::uuid` : Prisma.empty}
  `);
  const visible = summaries.filter((row) => row.last_id !== null);
  if (visible.length === 0) return [];

  const [conversations, lastMessages] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: visible.map((row) => row.conversation_id) } },
      select: conversationSelectFor(userId),
    }),
    db.message.findMany({
      where: { id: { in: visible.map((row) => row.last_id!) } },
      select: {
        id: true,
        type: true,
        content: true,
        meta: true,
        locationLabel: true,
        createdAt: true,
        sender: { select: { id: true, name: true } },
        upload: { select: { duration: true, originalName: true } },
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
    const myRole = conversation.members.find((member) => member.userId === userId)?.role ?? "MEMBER";
    // Channel subscribers never learn which admin posted or changed something.
    const hideAuthor = conversation.type === "CHANNEL" && myRole !== "ADMIN";
    const channelTitle = conversation.title ?? "Channel";
    const systemMeta = last.type === "SYSTEM" ? (last.meta as SystemMeta | null) : null;
    items.push({
      id: conversation.id,
      type: conversation.type,
      myRole,
      ...describe(conversation, userId),
      lastMessage: {
        id: last.id,
        type: last.type,
        duration: last.upload?.duration ?? null,
        content: preview(last.content),
        isMine: last.sender.id === userId,
        senderName: hideAuthor ? channelTitle : last.sender.name,
        meta:
          systemMeta && hideAuthor
            ? { event: systemMeta.event, actorId: conversation.id, actorName: channelTitle, newTitle: systemMeta.newTitle, removed: systemMeta.removed }
            : systemMeta,
        fileName: last.upload?.originalName ?? null,
        locationLabel: last.locationLabel,
      },
      lastMessageAt: last.createdAt.toISOString(),
      muted: summary.muted,
    });
  }
  return items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

// The single DIRECT conversation between two users, created on the fly (both
// as MEMBER). Safe against a concurrent creation: the unique directKey decides
// and the loser reads the winner's row (whose transaction added the members).
export async function getOrCreateDirectConversation(userId: string, otherId: string): Promise<string> {
  const directKey = directKeyFor(userId, otherId);
  try {
    return await db.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { directKey },
        create: { type: "DIRECT", directKey, createdById: userId },
        update: {},
        select: { id: true },
      });
      await tx.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId, role: "MEMBER" },
          { conversationId: conversation.id, userId: otherId, role: "MEMBER" },
        ],
        skipDuplicates: true,
      });
      return conversation.id;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    return (await db.conversation.findUniqueOrThrow({ where: { directKey }, select: { id: true } })).id;
  }
}

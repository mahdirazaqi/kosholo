import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import type { ChatMember, ChatMessage, MemberReadState, SystemMeta } from "@/lib/types/chat";
import { publicUserSelect } from "@/lib/users";

// Every message query uses this select, so the shape is always the same and
// never includes private user fields (email, passwordHash).
export const messageSelect = {
  id: true,
  conversationId: true,
  type: true,
  content: true,
  mediaUrl: true,
  meta: true,
  createdAt: true,
  replyToId: true,
  sender: { select: publicUserSelect },
  replyTo: {
    select: { id: true, type: true, content: true, sender: { select: { name: true } } },
  },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export function preview(content: string | null) {
  return content && content.length > PREVIEW_LENGTH ? content.slice(0, PREVIEW_LENGTH) : content;
}

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    type: row.type,
    content: row.content,
    mediaUrl: row.mediaUrl,
    meta: row.type === "SYSTEM" ? (row.meta as SystemMeta | null) : null,
    createdAt: row.createdAt.toISOString(),
    sender: row.sender,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          type: row.replyTo.type,
          content: preview(row.replyTo.content),
          senderName: row.replyTo.sender.name,
        }
      : row.replyToId
        ? "deleted"
        : null,
    status: "sent",
  };
}

// Conversation fields shared by the chat list and the chat screen.
export const conversationSelect = {
  id: true,
  type: true,
  title: true,
  avatarUrl: true,
  members: {
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      lastReadAt: true,
      user: { select: publicUserSelect },
    },
  },
} satisfies Prisma.ConversationSelect;

type MemberRow = Prisma.ConversationGetPayload<{
  select: typeof conversationSelect;
}>["members"][number];

export function toChatMember(member: MemberRow): ChatMember {
  return { ...member.user, role: member.role, joinedAt: member.joinedAt.toISOString() };
}

export function toReadState(member: MemberRow): MemberReadState {
  return {
    userId: member.userId,
    lastReadAt: member.lastReadAt?.toISOString() ?? null,
    joinedAt: member.joinedAt.toISOString(),
  };
}

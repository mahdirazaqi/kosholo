import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { chatMediaSelect, mediaThumbUrl, toChatMedia } from "@/lib/media/serialize";
import { toMemberView } from "@/lib/chat/channel-view";
import { isVisibleTo, type Viewer } from "@/lib/chat/visibility";
import type { ChatMember, ChatMessage, MemberReadState, SystemMeta } from "@/lib/types/chat";
import { publicUserSelect } from "@/lib/users";

// Every message query uses this select, so the shape is always the same and
// never includes private user fields (email, passwordHash).
export const messageSelect = {
  id: true,
  conversationId: true,
  type: true,
  content: true,
  meta: true,
  upload: { select: chatMediaSelect },
  latitude: true,
  longitude: true,
  locationLabel: true,
  createdAt: true,
  editedAt: true,
  replyToId: true,
  replyToDeleted: true,
  sender: { select: publicUserSelect },
  // CHANNEL: what subscribers see instead of the author (see channel-view.ts).
  conversation: { select: { type: true, title: true, avatarUrl: true, signMessages: true } },
  replyTo: {
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      latitude: true,
      longitude: true,
      locationLabel: true,
      sender: { select: { name: true } },
      upload: { select: { id: true, thumbPath: true, duration: true, originalName: true } },
      // Who deleted the original for themselves (server-side only, never sent).
      hides: { select: { userId: true } },
    },
  },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export function preview(content: string | null) {
  return content && content.length > PREVIEW_LENGTH ? content.slice(0, PREVIEW_LENGTH) : content;
}

// `viewer` hides a quote whose original the viewer can no longer see. Without
// a viewer (payloads for several recipients) the quote is kept; see
// quoteHiddenFor() for per-recipient delivery.
export function toChatMessage(row: MessageRow, viewer?: Viewer): ChatMessage {
  const message = toAdminMessage(row, viewer);
  // A channel post is shaped for the viewer: subscribers never see the author.
  // Without a viewer the real sender stays; callers fanning out to a channel
  // must build the subscriber copy themselves (emitMessageNew).
  if (viewer && row.conversation.type === "CHANNEL" && viewer.role !== "ADMIN") {
    return toMemberView(message, { id: row.conversationId, ...row.conversation, title: row.conversation.title ?? "Channel" });
  }
  return message;
}

function toAdminMessage(row: MessageRow, viewer?: Pick<Viewer, "userId" | "clearedAt">): ChatMessage {
  const quoteVisible = !row.replyTo || !viewer || !quoteHiddenFor(row, viewer);
  return {
    id: row.id,
    conversationId: row.conversationId,
    type: row.type,
    content: row.content,
    media: row.upload ? toChatMedia(row.upload) : null,
    location: toLocation(row),
    meta: row.type === "SYSTEM" ? (row.meta as SystemMeta | null) : null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    sender: row.sender,
    replyTo: row.replyTo && quoteVisible
      ? {
          id: row.replyTo.id,
          type: row.replyTo.type,
          content: preview(row.replyTo.content),
          senderName: row.replyTo.sender.name,
          thumbUrl: row.replyTo.upload?.thumbPath ? mediaThumbUrl(row.replyTo.upload.id) : null,
          duration: row.replyTo.upload?.duration ?? null,
          fileName: row.replyTo.upload?.originalName ?? null,
          location: toLocation(row.replyTo),
        }
      : row.replyToId || row.replyToDeleted
        ? "deleted"
        : null,
    status: "sent",
  };
}

function toLocation(row: { latitude: number | null; longitude: number | null; locationLabel: string | null }) {
  if (row.latitude === null || row.longitude === null) return null;
  return { latitude: row.latitude, longitude: row.longitude, label: row.locationLabel };
}

export function quoteHiddenFor(row: MessageRow, viewer: Pick<Viewer, "userId" | "clearedAt">) {
  if (!row.replyTo) return false;
  return !isVisibleTo(viewer, {
    createdAt: row.replyTo.createdAt,
    hiddenBy: row.replyTo.hides.map((hide) => hide.userId),
  });
}

const memberSelect = {
  userId: true,
  role: true,
  joinedAt: true,
  lastReadAt: true,
  muted: true,
  user: { select: publicUserSelect },
} satisfies Prisma.ConversationMemberSelect;

// Conversation fields shared by the chat list and the chat screen. This one
// loads every member: only for groups (group info, member payloads).
export const conversationSelect = {
  id: true,
  type: true,
  title: true,
  avatarUrl: true,
  description: true,
  signMessages: true,
  ownerId: true,
  _count: { select: { members: true } },
  members: { orderBy: { joinedAt: "asc" }, select: memberSelect },
} satisfies Prisma.ConversationSelect;

// What a viewer may load: all members, except in channels, where they only
// get their own row (a channel can have 10k subscribers, and only admins may
// see who they are; see listChannelMembers).
export function conversationSelectFor(userId: string) {
  return {
    ...conversationSelect,
    members: {
      where: { OR: [{ conversation: { type: { not: "CHANNEL" } } }, { userId }] },
      orderBy: { joinedAt: "asc" },
      select: memberSelect,
    },
  } satisfies Prisma.ConversationSelect;
}

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

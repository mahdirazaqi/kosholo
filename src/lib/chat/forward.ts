import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getOrCreateDirectConversation } from "@/lib/chat/conversations";
import { MAX_FORWARD_MESSAGES, MAX_FORWARD_TARGETS } from "@/lib/chat/forward-limits";
import { canPost } from "@/lib/chat/permissions";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { ChatMessage } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// THE copy implementation: forwarding, and saving to Saved Messages (which is
// just a forward whose only target is the user's SAVED conversation).
//
// Copies are independent messages: later edits or deletion of the original
// don't touch them. Files are shared by reference (the same Upload row), never
// duplicated on disk. Replies are not carried over.

export class ForwardError extends Error {}

export { MAX_FORWARD_MESSAGES, MAX_FORWARD_TARGETS };

export type ForwardTarget = { conversationId: string } | { userId: string };

export type ForwardInput = {
  sourceConversationId: string;
  messageIds: string[];
  targets: ForwardTarget[];
  comment?: string | null; // a normal TEXT message sent BEFORE the copies
  hideSender: boolean; // no forward snapshot: the copies look like I sent them
  hideCaptions: boolean; // media/file copies without captions (needs hideSender)
  // Single target only: the sender's optimistic ids, one per created message
  // (comment first), echoed in message:new so the client merges instead of duplicating.
  tempIds?: string[];
};

export type ForwardTargetResult = {
  targetConversationId: string | null;
  ok: boolean;
  error?: string;
  messages: ChatMessage[]; // created messages, comment first (admin version for channels)
};

const sourceSelect = {
  id: true,
  type: true,
  content: true,
  uploadId: true,
  latitude: true,
  longitude: true,
  locationLabel: true,
  createdAt: true,
  forwardFromName: true,
  forwardFromConversationId: true,
  forwardFromMessageId: true,
  forwardOriginalDate: true,
  sender: { select: { name: true } },
  conversation: { select: { type: true, title: true, signMessages: true } },
} satisfies Prisma.MessageSelect;

type Source = Prisma.MessageGetPayload<{ select: typeof sourceSelect }>;

const CAPTION_TYPES = ["IMAGE", "VIDEO", "FILE"];

export async function forwardMessages(userId: string, input: ForwardInput): Promise<ForwardTargetResult[]> {
  const { sourceConversationId, targets } = input;
  const messageIds = [...new Set(input.messageIds)];
  if (messageIds.length === 0 || messageIds.length > MAX_FORWARD_MESSAGES) {
    throw new ForwardError(`You can forward up to ${MAX_FORWARD_MESSAGES} messages at once`);
  }
  if (targets.length === 0 || targets.length > MAX_FORWARD_TARGETS) {
    throw new ForwardError(`You can forward to up to ${MAX_FORWARD_TARGETS} chats at once`);
  }
  if (input.hideCaptions && !input.hideSender) throw new ForwardError("Captions can only be hidden together with the sender");

  // Source: I'm a member and every message is visible to me.
  const sourceViewer = await getViewer(sourceConversationId, userId);
  if (!sourceViewer) throw new ForwardError("Chat not found");
  const sources = await db.message.findMany({
    where: { AND: [{ id: { in: messageIds }, conversationId: sourceConversationId }, visibleMessageWhere(sourceViewer)] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: sourceSelect,
  });
  if (sources.length !== messageIds.length) throw new ForwardError("Some of these messages are no longer available");
  if (sources.some((source) => source.type === "SYSTEM")) throw new ForwardError("Service messages can't be forwarded");

  const results: ForwardTargetResult[] = [];
  const done = new Set<string>();
  for (const target of targets) {
    let conversationId: string | null = null;
    try {
      conversationId = await resolveTarget(userId, target);
      if (done.has(conversationId)) continue; // the same chat twice
      done.add(conversationId);
      const messages = await db.$transaction((tx) => copyInto(tx, userId, conversationId!, sourceConversationId, sources, input));
      results.push({ targetConversationId: conversationId, ok: true, messages });
    } catch (error) {
      if (!(error instanceof ForwardError)) throw error;
      results.push({ targetConversationId: conversationId, ok: false, error: error.message, messages: [] });
    }
  }
  return results;
}

// A conversation id (I must be allowed to send there), or a contact I have no
// chat with yet (the direct conversation is created on the fly).
async function resolveTarget(userId: string, target: ForwardTarget): Promise<string> {
  if ("userId" in target) {
    if (!userIdSchema.safeParse(target.userId).success || target.userId === userId) throw new ForwardError("Chat not found");
    const isContact = await db.contact.count({ where: { ownerId: userId, contactId: target.userId } });
    if (!isContact) throw new ForwardError("Only your contacts can be forwarded to");
    return getOrCreateDirectConversation(userId, target.userId);
  }
  return target.conversationId;
}

async function copyInto(
  tx: Prisma.TransactionClient,
  userId: string,
  targetId: string,
  sourceConversationId: string,
  sources: Source[],
  input: ForwardInput,
): Promise<ChatMessage[]> {
  // Send permission: membership, and in channels the admin rule.
  const viewer = await getViewer(targetId, userId, tx);
  if (!viewer) throw new ForwardError("Chat not found");
  if (!canPost(viewer.conversationType, viewer.role)) throw new ForwardError("Only admins can post in this channel");
  if (viewer.conversationType === "SAVED" && targetId === sourceConversationId) {
    throw new ForwardError("These messages are already saved");
  }

  // Strictly increasing createdAt (1 ms apart): the comment, then the messages
  // in their original order, stable everywhere.
  const base = Date.now();
  let tick = 0;
  const created: ChatMessage[] = [];
  const comment = input.comment?.trim();
  if (comment) {
    const row = await tx.message.create({
      data: { conversationId: targetId, senderId: userId, type: "TEXT", content: comment, createdAt: new Date(base + tick++) },
      select: messageSelect,
    });
    created.push(toChatMessage(row, viewer));
  }

  for (const source of sources) {
    // An existing snapshot is kept, never nested. Channel posts only ever carry
    // the channel title (+ the signature when the channel signs), never an
    // admin's identity.
    const channel = source.conversation.type === "CHANNEL" ? source.conversation : null;
    const fromName =
      source.forwardFromName ??
      (channel
        ? `${channel.title ?? "Channel"}${channel.signMessages ? ` · ${source.sender.name}` : ""}`
        : source.sender.name);
    const snapshot = input.hideSender
      ? {}
      : {
          forwardFromName: fromName,
          forwardFromConversationId: source.forwardFromName ? source.forwardFromConversationId : sourceConversationId,
          forwardFromMessageId: source.forwardFromName ? source.forwardFromMessageId : source.id,
          forwardOriginalDate: source.forwardOriginalDate ?? source.createdAt,
        };
    const row = await tx.message.create({
      data: {
        conversationId: targetId,
        senderId: userId,
        type: source.type,
        content: input.hideCaptions && CAPTION_TYPES.includes(source.type) ? null : source.content,
        uploadId: source.uploadId, // the SAME upload: no file is copied
        latitude: source.latitude,
        longitude: source.longitude,
        locationLabel: source.locationLabel,
        createdAt: new Date(base + tick++),
        ...snapshot,
      },
      select: messageSelect,
    });
    created.push(toChatMessage(row, viewer));
  }

  // Like sending: the chat moves up, and sending counts as reading before it.
  const last = new Date(base + tick);
  await tx.conversation.update({ where: { id: targetId }, data: { updatedAt: last } });
  await tx.conversationMember.update({
    where: { conversationId_userId: { conversationId: targetId, userId } },
    data: { lastReadAt: last },
  });
  return viewer.conversationType === "CHANNEL" ? created.map((message) => ({ ...message, views: 1 })) : created;
}

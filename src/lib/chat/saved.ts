import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { ChatMessage } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// "Saved Messages": every user has exactly one private conversation with only
// themselves in it (type SAVED, directKey "saved:{userId}"). Saving a message
// creates an independent COPY there with a forward snapshot; an uploaded file
// is shared (same Upload row), never duplicated on disk.

export class SavedError extends Error {}

export const MAX_SAVE_MESSAGES = 100;
export const savedKeyFor = (userId: string) => `saved:${userId}`;

// Get-or-create, safe against two tabs doing it at once: the unique directKey
// decides, and the loser reads the winner's row.
export async function getOrCreateSavedConversation(userId: string): Promise<string> {
  const directKey = savedKeyFor(userId);
  const find = () => db.conversation.findUnique({ where: { directKey }, select: { id: true } });
  const existing = await find();
  if (existing) return existing.id;
  try {
    const created = await db.conversation.create({
      data: { type: "SAVED", directKey, createdById: userId, members: { create: { userId } } },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await find();
      if (winner) return winner.id;
    }
    throw error;
  }
}

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

// Copies `messageIds` of `conversationId` into my Saved Messages, in their
// original order, in one transaction. Returns the new messages.
export async function saveMessages(userId: string, conversationId: string, messageIds: string[]) {
  if (!userIdSchema.safeParse(conversationId).success) throw new SavedError("Chat not found");
  const viewer = await getViewer(conversationId, userId);
  if (!viewer) throw new SavedError("Chat not found");
  if (viewer.conversationType === "SAVED") throw new SavedError("These messages are already saved");

  const savedId = await getOrCreateSavedConversation(userId);

  return db.$transaction(async (tx) => {
    // Every message must be in this conversation and visible to me.
    const sources = await tx.message.findMany({
      where: { AND: [{ id: { in: messageIds }, conversationId }, visibleMessageWhere(viewer)] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: sourceSelect,
    });
    if (sources.length !== messageIds.length) throw new SavedError("Some of these messages are no longer available");
    if (sources.some((source) => source.type === "SYSTEM")) throw new SavedError("Service messages can't be saved");

    const base = Date.now();
    const created: ChatMessage[] = [];
    for (const [index, source] of sources.entries()) {
      // An existing snapshot stays (no nesting); otherwise snapshot the source.
      // Channel posts only ever carry the channel title (+ the signature when
      // the channel signs), never the admin's identity.
      const channel = source.conversation.type === "CHANNEL" ? source.conversation : null;
      const fromName =
        source.forwardFromName ??
        (channel
          ? `${channel.title ?? "Channel"}${channel.signMessages ? ` · ${source.sender.name}` : ""}`
          : source.sender.name);
      const row = await tx.message.create({
        data: {
          conversationId: savedId,
          senderId: userId,
          type: source.type,
          content: source.content,
          uploadId: source.uploadId, // the SAME upload: no file is copied
          latitude: source.latitude,
          longitude: source.longitude,
          locationLabel: source.locationLabel,
          // Copies are created a millisecond apart so they keep their order.
          createdAt: new Date(base + index),
          forwardFromName: fromName,
          forwardFromConversationId: source.forwardFromName ? source.forwardFromConversationId : conversationId,
          forwardFromMessageId: source.forwardFromName ? source.forwardFromMessageId : source.id,
          forwardOriginalDate: source.forwardOriginalDate ?? source.createdAt,
        },
        select: messageSelect,
      });
      const savedViewer = await getViewer(savedId, userId, tx);
      created.push(toChatMessage(row, savedViewer ?? undefined));
    }
    await tx.conversation.update({ where: { id: savedId }, data: { updatedAt: new Date(base + sources.length) } });
    return { savedConversationId: savedId, messages: created };
  });
}

// Can I still open the original of a saved copy? (It exists and I can see it.)
export async function canOpenOriginal(userId: string, conversationId: string, messageId: string) {
  const viewer = await getViewer(conversationId, userId);
  if (!viewer || viewer.conversationType === "SAVED") return false;
  const count = await db.message.count({
    where: { AND: [{ id: messageId, conversationId }, visibleMessageWhere(viewer)] },
  });
  return count > 0;
}

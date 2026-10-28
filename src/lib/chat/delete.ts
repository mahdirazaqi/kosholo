import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { recordEvent, type Actor } from "@/lib/chat/groups";
import { canClearForEveryone, canDeleteForEveryone } from "@/lib/chat/permissions";
import { collectGarbage, purgeConversation, purgeMessages, type Purged } from "@/lib/chat/purge";
import { visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { ChatMessage } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// Deleting messages and conversations. Every permission check runs inside the
// transaction that performs the change; violations throw DeleteError with a
// user-facing message. Callers (delete-actions.ts) unlink files after commit
// and emit realtime events.

export class DeleteError extends Error {}

type Tx = Prisma.TransactionClient;

const NOT_FOUND = "Chat not found";

async function membershipOf(tx: Tx, conversationId: string, userId: string) {
  if (!userIdSchema.safeParse(conversationId).success) throw new DeleteError(NOT_FOUND);
  const member = await tx.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { role: true, clearedAt: true, conversation: { select: { type: true } } },
  });
  if (!member) throw new DeleteError(NOT_FOUND);
  return {
    role: member.role,
    type: member.conversation.type,
    viewer: { userId, clearedAt: member.clearedAt },
  };
}

export type DeleteMessagesResult = { purged: Purged };

// `messageIds` are already validated (1–100 uuids, deduplicated).
export async function deleteMessages(
  actor: Actor,
  conversationId: string,
  messageIds: string[],
  forEveryone: boolean,
): Promise<DeleteMessagesResult> {
  return db.$transaction(async (tx) => {
    const me = await membershipOf(tx, conversationId, actor.id);
    // Only messages in this conversation that I can still see.
    const messages = await tx.message.findMany({
      where: { AND: [{ id: { in: messageIds }, conversationId }, visibleMessageWhere(me.viewer)] },
      select: { id: true, senderId: true, type: true },
    });
    if (messages.length !== messageIds.length) {
      throw new DeleteError("Some of these messages are no longer available");
    }

    if (forEveryone) {
      const who = { id: actor.id, role: me.role, conversationType: me.type };
      if (!messages.every((message) => canDeleteForEveryone(who, message))) {
        throw new DeleteError("You can't delete some of these messages for everyone");
      }
      return { purged: await purgeMessages(tx, { id: { in: messageIds } }) };
    }

    await tx.messageHide.createMany({
      data: messageIds.map((messageId) => ({ userId: actor.id, messageId })),
      skipDuplicates: true,
    });
    return { purged: await collectGarbage(tx, conversationId, messageIds) };
  });
}

export type ClearHistoryResult = {
  purged: Purged;
  clearedAt: Date;
  message: ChatMessage | null; // GROUP, for everyone: "… cleared the group history"
};

export async function clearHistory(
  actor: Actor,
  conversationId: string,
  forEveryone: boolean,
): Promise<ClearHistoryResult> {
  return db.$transaction(async (tx) => {
    const me = await membershipOf(tx, conversationId, actor.id);
    const clearedAt = new Date();

    if (forEveryone) {
      if (!canClearForEveryone({ role: me.role, conversationType: me.type })) {
        throw new DeleteError("Only group admins can clear the history for everyone");
      }
      const purged = await purgeMessages(tx, { conversationId, createdAt: { lte: clearedAt } });
      const message =
        me.type === "GROUP"
          ? // A moment later so it's never covered by the clear itself.
            await recordEvent(tx, conversationId, actor, { event: "history_cleared" }, new Date(clearedAt.getTime() + 1))
          : null;
      return { purged, clearedAt, message };
    }

    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { clearedAt },
    });
    return { purged: await collectGarbage(tx, conversationId), clearedAt, message: null };
  });
}

// DIRECT only (groups use "leave and delete" or the admin's "delete group").
// For me: clears my history, so the chat leaves my list until a new message
// arrives. For everyone: hard-deletes the conversation.
export async function deleteDirectConversation(
  actor: Actor,
  conversationId: string,
  forEveryone: boolean,
): Promise<{ purged: Purged; clearedAt: Date | null }> {
  const me = await db.$transaction((tx) => membershipOf(tx, conversationId, actor.id));
  if (me.type !== "DIRECT") throw new DeleteError(NOT_FOUND);
  if (!forEveryone) {
    const { purged, clearedAt } = await clearHistory(actor, conversationId, false);
    return { purged, clearedAt };
  }
  return db.$transaction(async (tx) => {
    await membershipOf(tx, conversationId, actor.id);
    return { purged: await purgeConversation(tx, conversationId), clearedAt: null };
  });
}

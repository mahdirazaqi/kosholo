"use server";

import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { EditError, editMessage as editInDb, getEditsSince as editsInDb } from "@/lib/chat/edit";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { emitChunked } from "@/lib/realtime/emit";
import type { ChatMessage } from "@/lib/types/chat";
import { editMessageSchema } from "@/lib/validations/chat";

export type EditMessageResult =
  | { ok: true; message: ChatMessage; changed: boolean }
  | { ok: false; error: string; gone?: boolean };

// requireUser → validate → rate limit → permission/window/visibility checks and
// one conditional update (lib/chat/edit.ts) → message:edited to the members who
// can still see the message.
export async function editMessage(input: {
  conversationId: string;
  messageId: string;
  content: string;
}): Promise<EditMessageResult> {
  const me = await requireUser();
  const parsed = editMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { conversationId, messageId, content } = parsed.data;

  const limitKey = `edit:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.edits)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.edits);

  try {
    const result = await editInDb(me.id, conversationId, messageId, content);
    if (!result.changed) return { ok: true, message: result.message, changed: false };

    // Members for whom the message is visible: not hidden it, not cleared past it.
    const recipients = await db.conversationMember.findMany({
      where: {
        conversationId,
        OR: [{ clearedAt: null }, { clearedAt: { lt: result.createdAt } }],
        user: { messageHides: { none: { messageId } } },
      },
      select: { userId: true },
    });
    // The payload has no author, so subscribers of a channel learn nothing
    // about which admin edited.
    await emitChunked(
      recipients.map((member) => member.userId),
      "message:edited",
      { conversationId, messageId, content: result.content, editedAt: result.editedAt.toISOString() },
    );
    return { ok: true, message: result.message, changed: true };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof EditError) return { ok: false, error: error.message, gone: error.gone };
    logger.error("edit-message", "failed", error);
    return { ok: false, error: "Something went wrong, please try again" };
  }
}

// Catch-up after reconnecting: edits since `since` within the loaded range.
export async function getEditsSince(conversationId: string, since: string, from: string) {
  const me = await requireUser();
  const sinceDate = new Date(since);
  const fromDate = new Date(from);
  if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(fromDate.getTime())) return null;
  const edits = await editsInDb(me.id, conversationId, sinceDate, fromDate);
  return edits && { edits, serverNow: new Date().toISOString() };
}

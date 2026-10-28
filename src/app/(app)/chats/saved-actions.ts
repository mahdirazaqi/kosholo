"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { canOpenOriginal, MAX_SAVE_MESSAGES, SavedError, saveMessages as saveInDb } from "@/lib/chat/saved";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { emitToUsers } from "@/lib/realtime/emit";
import { userIdSchema } from "@/lib/validations/contacts";
import { z } from "zod";

const saveSchema = z.object({
  conversationId: z.uuid({ error: "Chat not found" }),
  messageIds: z
    .array(z.uuid({ error: "Invalid message" }))
    .min(1, "No messages selected")
    .max(MAX_SAVE_MESSAGES, `You can save up to ${MAX_SAVE_MESSAGES} messages at once`)
    .transform((ids) => [...new Set(ids)]),
});

export type SaveMessagesResult =
  | { ok: true; count: number; savedConversationId: string }
  | { ok: false; error: string };

// Copies messages into my Saved Messages (one transaction, original order).
// The copies reach only my own rooms (my other tabs and devices).
export async function saveMessages(input: { conversationId: string; messageIds: string[] }): Promise<SaveMessagesResult> {
  const me = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const limitKey = `save:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.saves)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.saves);

  try {
    const { savedConversationId, messages } = await saveInDb(me.id, parsed.data.conversationId, parsed.data.messageIds);
    for (const message of messages) emitToUsers([me.id], "message:new", { message, tempId: null });
    revalidatePath("/");
    return { ok: true, count: messages.length, savedConversationId };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SavedError) return { ok: false, error: error.message };
    logger.error("save-messages", "failed", error);
    return { ok: false, error: "Something went wrong, please try again" };
  }
}

// Tapping "Forwarded from …": does the original still exist and can I see it?
export async function checkForwardOrigin(conversationId: string, messageId: string): Promise<boolean> {
  const me = await requireUser();
  if (!userIdSchema.safeParse(conversationId).success || !userIdSchema.safeParse(messageId).success) return false;
  return canOpenOriginal(me.id, conversationId, messageId);
}

"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ForwardError, MAX_FORWARD_MESSAGES } from "@/lib/chat/forward";
import { runForward } from "@/lib/chat/forward-emit";
import { canOpenOriginal, savedTarget } from "@/lib/chat/saved";
import { logger } from "@/lib/logger";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { userIdSchema } from "@/lib/validations/contacts";

const saveSchema = z.object({
  conversationId: z.uuid({ error: "Chat not found" }),
  messageIds: z
    .array(z.uuid({ error: "Invalid message" }))
    .min(1, "No messages selected")
    .max(MAX_FORWARD_MESSAGES, `You can save up to ${MAX_FORWARD_MESSAGES} messages at once`),
});

export type SaveMessagesResult =
  | { ok: true; count: number; savedConversationId: string }
  | { ok: false; error: string };

// Saving = forwarding to my own Saved Messages (the one copy implementation in
// lib/chat/forward.ts): independent copies with the forward snapshot, files
// shared. The copies reach only my own rooms (I'm its only member).
export async function saveMessages(input: { conversationId: string; messageIds: string[] }): Promise<SaveMessagesResult> {
  const me = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const limitKey = `save:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.saves)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.saves);

  try {
    const [result] = await runForward(me.id, {
      sourceConversationId: parsed.data.conversationId,
      messageIds: parsed.data.messageIds,
      targets: [await savedTarget(me.id)],
      hideSender: false,
      hideCaptions: false,
    });
    if (!result?.ok || !result.targetConversationId) return { ok: false, error: result?.error ?? "Couldn't save" };
    revalidatePath("/");
    return { ok: true, count: result.messages.length, savedConversationId: result.targetConversationId };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ForwardError) return { ok: false, error: error.message };
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

"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/contacts";
import { getOrCreateDirectConversation } from "@/lib/chat/conversations";
import { db } from "@/lib/db";
import { ForwardError, MAX_FORWARD_MESSAGES, MAX_FORWARD_TARGETS } from "@/lib/chat/forward";
import { runForward } from "@/lib/chat/forward-emit";
import { getOrCreateSavedConversation } from "@/lib/chat/saved";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { logger } from "@/lib/logger";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import type { ChatMessage } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";

const forwardSchema = z.object({
  sourceConversationId: z.uuid({ error: "Chat not found" }),
  messageIds: z
    .array(z.uuid({ error: "Invalid message" }))
    .min(1, "No messages selected")
    .max(MAX_FORWARD_MESSAGES, `You can forward up to ${MAX_FORWARD_MESSAGES} messages at once`),
  targets: z
    .array(z.union([z.object({ conversationId: z.uuid() }), z.object({ userId: z.uuid() })]))
    .min(1, "Choose where to forward")
    .max(MAX_FORWARD_TARGETS, `You can forward to up to ${MAX_FORWARD_TARGETS} chats at once`),
  comment: z.string().trim().max(MAX_MESSAGE_LENGTH, "Message is too long").nullish(),
  hideSender: z.boolean(),
  hideCaptions: z.boolean(),
  tempIds: z.array(z.string().max(64)).max(MAX_FORWARD_MESSAGES + 1).optional(),
});

export type ForwardActionResult =
  | {
      ok: true;
      // `messages`: what was created in that target (the forwarder's own view), comment first.
      results: { targetConversationId: string | null; ok: boolean; error?: string; messages: ChatMessage[] }[];
    }
  | { ok: false; error: string };

// requireUser → zod → rate limit → source/target checks and one transaction per
// target (lib/chat/forward.ts) → message:new for each target's members.
// A failing target doesn't block the others.
export async function forwardMessages(input: z.input<typeof forwardSchema>): Promise<ForwardActionResult> {
  const me = await requireUser();
  const parsed = forwardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const limitKey = `forward:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.forwards)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(limitKey, LIMITS.forwards);

  try {
    const results = await runForward(me.id, { ...parsed.data, comment: parsed.data.comment ?? null });
    revalidatePath("/");
    return {
      ok: true,
      results: results.map(({ targetConversationId, ok, error, messages }) => ({ targetConversationId, ok, error, messages })),
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ForwardError) return { ok: false, error: error.message };
    logger.error("forward", "failed", error);
    return { ok: false, error: "Something went wrong, please try again" };
  }
}

// For the picker: my Saved Messages (created if needed) and my contacts. The
// picker matches contacts against the chat list to find those without a chat.
export async function getForwardTargets(): Promise<{ savedConversationId: string; contacts: PublicUser[] }> {
  const me = await requireUser();
  const [savedConversationId, contacts] = await Promise.all([getOrCreateSavedConversation(me.id), getContacts(me.id)]);
  return { savedConversationId, contacts };
}

// A contact I have no chat with yet: the direct conversation is created now
// (the same get-or-create as starting a chat, without redirecting).
export async function ensureDirectConversation(userId: string): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const me = await requireUser();
  if (userId === me.id) return { ok: false, error: "Chat not found" };
  const isContact = await db.contact.count({ where: { ownerId: me.id, contactId: userId } });
  if (!isContact) return { ok: false, error: "Only your contacts can be forwarded to" };
  return { ok: true, conversationId: await getOrCreateDirectConversation(me.id, userId) };
}

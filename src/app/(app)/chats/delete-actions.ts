"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as del from "@/lib/chat/delete";
import { DeleteError } from "@/lib/chat/delete";
import type { Actor } from "@/lib/chat/groups";
import { unlinkPurgedFiles, type Purged } from "@/lib/chat/purge";
import { logger } from "@/lib/logger";
import { emitConversationDeleted, emitToMembers, emitToUsers } from "@/lib/realtime/emit";
import { conversationDeleteSchema, deleteMessagesSchema } from "@/lib/validations/chat";

// Every action: requireUser → validate → transactional change with permission
// checks (lib/chat/delete.ts) → unlink files (after commit) → realtime events.
// Nothing here trusts the client.

export type DeleteActionResult = { ok: true; conversationDeleted: boolean } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong, please try again";

async function run(work: (actor: Actor) => Promise<Purged>): Promise<DeleteActionResult> {
  try {
    const user = await requireUser();
    const purged = await work({ id: user.id, name: user.name });
    await unlinkPurgedFiles(purged);
    if (purged.deletedConversation) {
      emitConversationDeleted(purged.deletedConversation.id, purged.deletedConversation.memberIds);
    }
    revalidatePath("/");
    return { ok: true, conversationDeleted: purged.deletedConversation !== null };
  } catch (error) {
    unstable_rethrow(error); // redirects from requireUser()
    if (error instanceof DeleteError) return { ok: false, error: error.message };
    logger.error("delete-action", "failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }) {
  if (!result.success) throw new DeleteError(result.error.issues[0].message);
  return result.data;
}

export async function deleteMessages(input: { conversationId: string; messageIds: string[]; forEveryone: boolean }) {
  return run(async (actor) => {
    const { conversationId, messageIds, forEveryone } = parse(deleteMessagesSchema.safeParse(input));
    const { purged } = await del.deleteMessages(actor, conversationId, messageIds, forEveryone);
    const payload = { conversationId, messageIds };
    // For everyone: every member (sent before a possible conversation:deleted,
    // while the member cache still knows them). For me: my other tabs/devices.
    if (forEveryone) await emitToMembers(conversationId, "message:deleted", payload);
    else emitToUsers([actor.id], "message:deleted", payload);
    return purged;
  });
}

export async function clearHistory(input: { conversationId: string; forEveryone: boolean }) {
  return run(async (actor) => {
    const { conversationId, forEveryone } = parse(conversationDeleteSchema.safeParse(input));
    const { purged, clearedAt, message } = await del.clearHistory(actor, conversationId, forEveryone);
    const payload = { conversationId, forEveryone, before: clearedAt.toISOString() };
    if (forEveryone) await emitToMembers(conversationId, "conversation:cleared", payload);
    else emitToUsers([actor.id], "conversation:cleared", payload);
    if (message) await emitToMembers(conversationId, "message:new", { message, tempId: null });
    return purged;
  });
}

// DIRECT chats only.
export async function deleteConversation(input: { conversationId: string; forEveryone: boolean }) {
  return run(async (actor) => {
    const { conversationId, forEveryone } = parse(conversationDeleteSchema.safeParse(input));
    const { purged, clearedAt } = await del.deleteDirectConversation(actor, conversationId, forEveryone);
    if (clearedAt) {
      emitToUsers([actor.id], "conversation:cleared", {
        conversationId,
        forEveryone: false,
        before: clearedAt.toISOString(),
      });
    }
    return purged;
  });
}

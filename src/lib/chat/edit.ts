import "server-only";

import { editWindowHours } from "@/lib/chat/edit-config";
import { EDIT_ERRORS, editBlock } from "@/lib/chat/permissions";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import type { ChatMessage } from "@/lib/types/chat";

// Editing overwrites the message in place: only the latest content and the
// time of the last edit exist (no history, like hard deletion). It never
// touches createdAt (order), conversation.updatedAt, read positions or views.

export class EditError extends Error {
  constructor(
    message: string,
    readonly gone = false, // deleted or no longer visible: the client drops it
  ) {
    super(message);
  }
}

export const MESSAGE_GONE = "This message has been deleted";

export type EditResult =
  | { changed: false; message: ChatMessage }
  | { changed: true; message: ChatMessage; content: string | null; editedAt: Date; createdAt: Date };

// `content` is already trimmed and ≤ 4000 chars (editMessageSchema).
export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
): Promise<EditResult> {
  const viewer = await getViewer(conversationId, userId);
  if (!viewer) throw new EditError("Chat not found", true);

  const where = { AND: [{ id: messageId, conversationId }, visibleMessageWhere(viewer)] };
  const current = await db.message.findFirst({
    where,
    select: { senderId: true, type: true, content: true, createdAt: true, forwardFromName: true },
  });
  if (!current) throw new EditError(MESSAGE_GONE, true);

  const block = editBlock(
    { id: userId, role: viewer.role, conversationType: viewer.conversationType },
    { ...current, forwarded: current.forwardFromName !== null },
    editWindowHours(),
  );
  if (block) throw new EditError(EDIT_ERRORS[block]);

  // Text can't become empty (the client offers deletion instead); a caption can
  // be removed.
  const isText = current.type === "TEXT";
  if (isText && content.length === 0) throw new EditError("Message is empty");
  if (isText ? content.length > MAX_MESSAGE_LENGTH : content.length > MAX_CAPTION_LENGTH) {
    throw new EditError(isText ? "Message is too long" : "Caption is too long");
  }
  const next = content || null;

  // Same content: nothing is saved, editedAt stays, no event.
  const read = () =>
    db.message.findFirstOrThrow({ where: { id: messageId }, select: messageSelect });
  if (next === (current.content || null)) {
    return { changed: false, message: toChatMessage(await read(), viewer) };
  }

  // One conditional update: it only matches while the message still exists and
  // is still visible to the editor.
  const editedAt = new Date();
  const updated = await db.message.updateMany({ where, data: { content: next, editedAt } });
  if (updated.count === 0) throw new EditError(MESSAGE_GONE, true);

  return {
    changed: true,
    message: toChatMessage(await read(), viewer),
    content: next,
    editedAt,
    createdAt: current.createdAt,
  };
}

// Edits made after `since` to visible messages of the loaded range (created at
// or after `from`), for catching up after being offline.
export async function getEditsSince(userId: string, conversationId: string, since: Date, from: Date) {
  const viewer = await getViewer(conversationId, userId);
  if (!viewer) return null;
  const rows = await db.message.findMany({
    where: {
      AND: [
        { conversationId, editedAt: { gt: since }, createdAt: { gte: from } },
        visibleMessageWhere(viewer),
      ],
    },
    orderBy: { editedAt: "asc" },
    take: 200,
    select: { id: true, content: true, editedAt: true },
  });
  return rows.flatMap((row) =>
    row.editedAt ? [{ messageId: row.id, content: row.content, editedAt: row.editedAt.toISOString() }] : [],
  );
}

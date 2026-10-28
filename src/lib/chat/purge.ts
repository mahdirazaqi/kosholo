import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { visibleSql } from "@/lib/chat/visibility";
import { deleteFiles } from "@/lib/media/storage";

// Hard deletion. There is no soft delete anywhere: rows are removed, and their
// upload files are unlinked once the transaction has committed. Every helper
// runs inside the caller's transaction and returns the file paths to unlink.

type Tx = Prisma.TransactionClient;

export type Purged = {
  files: string[]; // relative paths under UPLOAD_DIR, unlink after commit
  messageIds: string[]; // hard-deleted messages
  // Set when the conversation itself was hard-deleted: its former members.
  deletedConversation: { id: string; memberIds: string[] } | null;
};

const nothing = (): Purged => ({ files: [], messageIds: [], deletedConversation: null });

// Deletes the matching messages and the uploads only they used (message uploads are
// never avatars: sendMessage rejects AVATAR uploads, and avatars are never
// attached to a message). Replies to them keep a "Message unavailable" quote.
export async function purgeMessages(tx: Tx, where: Prisma.MessageWhereInput): Promise<Purged> {
  const rows = await tx.message.findMany({
    where,
    select: { id: true, upload: { select: { id: true, kind: true, path: true, thumbPath: true } } },
  });
  if (rows.length === 0) return nothing();
  const ids = rows.map((row) => row.id);
  await tx.message.updateMany({
    where: { replyToId: { in: ids }, id: { notIn: ids } },
    data: { replyToDeleted: true },
  });
  await tx.message.deleteMany({ where: { id: { in: ids } } });

  // Uploads may be shared by saved copies: a file goes only when no remaining
  // message references it (the purged ones are already deleted above).
  const candidates = rows.flatMap((row) => (row.upload && row.upload.kind !== "AVATAR" ? [row.upload] : []));
  const stillUsed = candidates.length
    ? await tx.message.findMany({
        where: { uploadId: { in: candidates.map((upload) => upload.id) } },
        select: { uploadId: true },
        distinct: ["uploadId"],
      })
    : [];
  const used = new Set(stillUsed.map((row) => row.uploadId));
  const uploads = [...new Map(candidates.filter((upload) => !used.has(upload.id)).map((u) => [u.id, u])).values()];
  if (uploads.length) await tx.upload.deleteMany({ where: { id: { in: uploads.map((upload) => upload.id) } } });
  return {
    files: uploads.flatMap((upload) => (upload.thumbPath ? [upload.path, upload.thumbPath] : [upload.path])),
    messageIds: ids,
    deletedConversation: null,
  };
}

// Hard-deletes a conversation with everything in it (members, messages and
// hides cascade; uploads are removed here).
export async function purgeConversation(tx: Tx, conversationId: string): Promise<Purged> {
  const members = await tx.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  const purged = await purgeMessages(tx, { conversationId });
  await tx.conversation.delete({ where: { id: conversationId } });
  return { ...purged, deletedConversation: { id: conversationId, memberIds: members.map((m) => m.userId) } };
}

// After a "for me" change (hide, clear, leave): hard-deletes the messages no
// current member can see any more (all of the conversation's, or only
// `messageIds`). A DIRECT conversation with no messages left whose members
// have all cleared it is deleted too.
export async function collectGarbage(tx: Tx, conversationId: string, messageIds?: string[]): Promise<Purged> {
  const garbage = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT m.id FROM messages m
    WHERE m.conversation_id = ${conversationId}::uuid
      ${messageIds ? Prisma.sql`AND m.id = ANY(${messageIds}::uuid[])` : Prisma.empty}
      AND NOT EXISTS (
        SELECT 1 FROM conversation_members cm
        WHERE cm.conversation_id = m.conversation_id AND ${visibleSql("m", "cm")}
      )
  `);
  const purged = garbage.length
    ? await purgeMessages(tx, { id: { in: garbage.map((row) => row.id) } })
    : nothing();

  const conversation = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      members: { select: { userId: true, clearedAt: true } },
      _count: { select: { messages: true } },
    },
  });
  if (
    conversation?.type === "DIRECT" &&
    conversation._count.messages === 0 &&
    conversation.members.every((member) => member.clearedAt !== null)
  ) {
    await tx.conversation.delete({ where: { id: conversationId } });
    purged.deletedConversation = {
      id: conversationId,
      memberIds: conversation.members.map((member) => member.userId),
    };
  }
  return purged;
}

// Missing files are ignored; other errors are logged by deleteFiles.
export async function unlinkPurgedFiles(purged: Pick<Purged, "files">) {
  if (purged.files.length) await deleteFiles(purged.files);
}

export { nothing as nothingPurged };

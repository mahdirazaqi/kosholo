import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getViewer, visibleMessageWhere } from "@/lib/chat/visibility";
import { db } from "@/lib/db";

// "Saved Messages": every user has exactly one private conversation with only
// themselves in it (type SAVED, directKey "saved:{userId}"). Saving a message
// creates an independent COPY there (see forward.ts) with a forward snapshot; an uploaded file
// is shared (same Upload row), never duplicated on disk.

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

// Saving is a forward whose only target is my Saved Messages
// (lib/chat/forward.ts is the one copy implementation).
export async function savedTarget(userId: string) {
  return { conversationId: await getOrCreateSavedConversation(userId) };
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

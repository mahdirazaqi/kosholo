import "server-only";

import { getViewer, isVisibleTo } from "@/lib/chat/visibility";
import { db } from "@/lib/db";

// Several messages may share one upload (saved copies), so access is granted
// when the user can see AT LEAST ONE message that references it:
// - AVATAR: any signed-in user,
// - a message's file: members who can see one of its messages (visibility rule),
// - an upload not attached to any message yet: its uploader (their pending
//   optimistic message).
export async function canReadUpload(upload: { id: string; kind: string; ownerId: string }, userId: string) {
  if (upload.kind === "AVATAR") return true;
  const messages = await db.message.findMany({
    where: { uploadId: upload.id },
    select: { conversationId: true, createdAt: true, hides: { where: { userId }, select: { userId: true } } },
    take: 50,
  });
  if (messages.length === 0) return upload.ownerId === userId;
  for (const message of messages) {
    const viewer = await getViewer(message.conversationId, userId);
    if (viewer && isVisibleTo(viewer, { createdAt: message.createdAt, hiddenBy: message.hides.map((h) => h.userId) })) {
      return true;
    }
  }
  return false;
}

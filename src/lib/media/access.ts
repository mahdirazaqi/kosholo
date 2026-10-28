import "server-only";

import { getViewer, isVisibleTo } from "@/lib/chat/visibility";
import { db } from "@/lib/db";

// Who may fetch /api/media/{id}:
// - AVATAR: any signed-in user,
// - a message's file: members who can see that message (visibility rule),
// - an upload not attached to a message yet: its uploader (their pending
//   optimistic message).
export async function canReadUpload(upload: { id: string; kind: string; ownerId: string }, userId: string) {
  if (upload.kind === "AVATAR") return true;
  const message = await db.message.findUnique({
    where: { uploadId: upload.id },
    select: { conversationId: true, createdAt: true, hides: { where: { userId }, select: { userId: true } } },
  });
  if (!message) return upload.ownerId === userId;
  const viewer = await getViewer(message.conversationId, userId);
  return viewer !== null && isVisibleTo(viewer, { createdAt: message.createdAt, hiddenBy: message.hides.map((h) => h.userId) });
}

import "server-only";

import { db } from "@/lib/db";
import { isConversationMember } from "@/lib/realtime/membership";

// Who may fetch /api/media/{id}:
// - AVATAR: any signed-in user,
// - otherwise: the uploader (their pending optimistic message), or a member of
//   the conversation whose message uses the upload.
export async function canReadUpload(upload: { id: string; kind: string; ownerId: string }, userId: string) {
  if (upload.kind === "AVATAR" || upload.ownerId === userId) return true;
  const message = await db.message.findUnique({
    where: { uploadId: upload.id },
    select: { conversationId: true },
  });
  return message ? isConversationMember(message.conversationId, userId) : false;
}

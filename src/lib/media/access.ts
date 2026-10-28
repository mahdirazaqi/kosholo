import "server-only";

import { getViewer, isVisibleTo } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import { canSeeProfilePhotos } from "@/lib/profile-photos";

// Several messages may share one upload (saved copies), so access is granted
// when the user can see AT LEAST ONE message that references it:
// - AVATAR: a profile photo (in a gallery) only for people who may see that
//   user's photos (lib/profile-photos.ts); group/channel photos: any signed-in user,
// - a message's file: members who can see one of its messages (visibility rule),
// - an upload not attached to any message yet: its uploader (their pending
//   optimistic message).
export async function canReadUpload(
  upload: { id: string; kind: string; ownerId: string; mediumPath?: string | null },
  userId: string,
) {
  if (upload.kind === "AVATAR") {
    // A profile photo: only people allowed to see that user's photos.
    const photo = await db.profilePhoto.findUnique({ where: { uploadId: upload.id }, select: { userId: true } });
    if (photo) return canSeeProfilePhotos(userId, photo.userId);
    // Uploaded for the gallery but not added yet: its owner only. Group and
    // channel photos stay readable by any signed-in user.
    return upload.mediumPath ? upload.ownerId === userId : true;
  }
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

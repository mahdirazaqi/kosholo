import "server-only";

import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/media/serialize";
import { isUuid } from "@/lib/realtime/membership";

export class AvatarUploadError extends Error {}

const BAD_UPLOAD = "Photo not found, please choose it again";

// An avatar upload must be mine and of kind AVATAR (processed to 512/128
// WebP). Returns the "/api/media/{id}" url to store, or null (no photo).
export async function avatarUrlFor(uploadId: string | null | undefined, ownerId: string) {
  if (uploadId === null || uploadId === undefined) return null;
  if (!isUuid(uploadId)) throw new AvatarUploadError(BAD_UPLOAD);
  const upload = await db.upload.findFirst({ where: { id: uploadId, ownerId, kind: "AVATAR" }, select: { id: true } });
  if (!upload) throw new AvatarUploadError(BAD_UPLOAD);
  return mediaUrl(upload.id);
}

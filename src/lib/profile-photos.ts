import "server-only";

import { db } from "@/lib/db";
import { deleteFiles } from "@/lib/media/storage";
import { MAX_PROFILE_PHOTOS } from "@/lib/media/limits";
import { mediaThumbUrl, mediaUrl } from "@/lib/media/serialize";
import type { ProfilePhotoItem } from "@/lib/types/profile";
import { userIdSchema } from "@/lib/validations/contacts";

// Profile photo gallery. The first photo (highest sortKey) is the main one and
// User.avatarUrl ("/api/media/{uploadId}") points at it, so every existing
// avatar component keeps working; it changes in the same transaction as the
// gallery. Photos are hard-deleted with their files.

export class ProfilePhotoError extends Error {}

// ---- Who may see a user's photos ----
// The user, their contacts (either direction), people who share a DIRECT or
// GROUP conversation with them, and admins of a channel they are in. Nobody
// else (channel subscribers never learn who else is subscribed).
const ACCESS_TTL_MS = 30_000;
const globalForAccess = globalThis as unknown as { __photoAccess?: Map<string, { ok: boolean; until: number }> };
const accessCache = (globalForAccess.__photoAccess ??= new Map());

export async function canSeeProfilePhotos(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const key = `${viewerId}:${ownerId}`;
  const now = Date.now();
  const hit = accessCache.get(key);
  if (hit && hit.until > now) return hit.ok;

  const [contact, shared] = await Promise.all([
    db.contact.count({
      where: {
        OR: [
          { ownerId: viewerId, contactId: ownerId },
          { ownerId, contactId: viewerId },
        ],
      },
    }),
    db.conversation.count({
      where: {
        AND: [{ members: { some: { userId: viewerId } } }, { members: { some: { userId: ownerId } } }],
        OR: [
          { type: { in: ["DIRECT", "GROUP"] } },
          { type: "CHANNEL", members: { some: { userId: viewerId, role: "ADMIN" } } },
        ],
      },
    }),
  ]);
  const ok = contact > 0 || shared > 0;
  if (accessCache.size > 5000) for (const [k, v] of accessCache) if (v.until <= now) accessCache.delete(k);
  accessCache.set(key, { ok, until: now + ACCESS_TTL_MS });
  return ok;
}

// ---- Reads ----
const photoSelect = {
  id: true,
  createdAt: true,
  upload: { select: { id: true, placeholder: true } },
} as const;

function toItem(row: { id: string; createdAt: Date; upload: { id: string; placeholder: string | null } }, isMain: boolean): ProfilePhotoItem {
  return {
    id: row.id,
    fullUrl: mediaUrl(row.upload.id),
    mediumUrl: `${mediaUrl(row.upload.id)}/medium`,
    thumbUrl: mediaThumbUrl(row.upload.id),
    placeholder: row.upload.placeholder,
    createdAt: row.createdAt.toISOString(),
    isMain,
  };
}

// The gallery of `ownerId` as `viewerId` may see it, newest-first; null when
// the viewer isn't allowed (callers answer 404/empty).
export async function getProfilePhotos(viewerId: string, ownerId: string): Promise<ProfilePhotoItem[] | null> {
  if (!userIdSchema.safeParse(ownerId).success) return null;
  if (!(await canSeeProfilePhotos(viewerId, ownerId))) return null;
  const rows = await db.profilePhoto.findMany({
    where: { userId: ownerId },
    orderBy: [{ sortKey: "desc" }, { id: "desc" }],
    select: photoSelect,
  });
  return rows.map((row, index) => toItem(row, index === 0));
}

// ---- Writes (owner only: callers pass the signed-in user's id) ----

// New photos go to the front: the FIRST selected becomes the main photo and the
// rest follow in selection order, ahead of everything already there.
export async function addProfilePhotos(userId: string, uploadIds: string[]) {
  const ids = [...new Set(uploadIds)];
  if (ids.length === 0) throw new ProfilePhotoError("No photos selected");
  return db.$transaction(async (tx) => {
    const uploads = await tx.upload.findMany({
      // Mine, a profile-photo upload (it has the medium size), not used yet.
      where: { id: { in: ids }, ownerId: userId, kind: "AVATAR", mediumPath: { not: null }, profilePhoto: null },
      select: { id: true },
    });
    if (uploads.length !== ids.length) throw new ProfilePhotoError("Photo not found, please choose it again");
    const [count, newest] = await Promise.all([
      tx.profilePhoto.count({ where: { userId } }),
      tx.profilePhoto.findFirst({ where: { userId }, orderBy: { sortKey: "desc" }, select: { sortKey: true } }),
    ]);
    if (count + ids.length > MAX_PROFILE_PHOTOS) {
      throw new ProfilePhotoError(`You can have up to ${MAX_PROFILE_PHOTOS} profile photos`);
    }
    const base = Math.max(Date.now(), (newest?.sortKey.getTime() ?? 0) + 1);
    await tx.profilePhoto.createMany({
      // ids[0] gets the highest sortKey.
      data: ids.map((uploadId, index) => ({ userId, uploadId, sortKey: new Date(base + (ids.length - 1 - index)) })),
    });
    await tx.user.update({ where: { id: userId }, data: { avatarUrl: mediaUrl(ids[0]) } });
  });
}

export async function setMainProfilePhoto(userId: string, photoId: string) {
  return db.$transaction(async (tx) => {
    const photo = await tx.profilePhoto.findFirst({ where: { id: photoId, userId }, select: { uploadId: true } });
    if (!photo) throw new ProfilePhotoError("Photo not found");
    const newest = await tx.profilePhoto.findFirst({ where: { userId }, orderBy: { sortKey: "desc" }, select: { sortKey: true } });
    await tx.profilePhoto.update({
      where: { id: photoId },
      data: { sortKey: new Date(Math.max(Date.now(), (newest?.sortKey.getTime() ?? 0) + 1)) },
    });
    await tx.user.update({ where: { id: userId }, data: { avatarUrl: mediaUrl(photo.uploadId) } });
  });
}

// Hard delete: the row, the Upload and all its files (unlinked after commit).
// If it was the main photo the next one becomes main; none left → no avatar.
export async function deleteProfilePhoto(userId: string, photoId: string) {
  const files = await db.$transaction(async (tx) => {
    const photo = await tx.profilePhoto.findFirst({
      where: { id: photoId, userId },
      select: { upload: { select: { id: true, path: true, thumbPath: true, mediumPath: true } } },
    });
    if (!photo) throw new ProfilePhotoError("Photo not found");
    await tx.upload.delete({ where: { id: photo.upload.id } }); // cascades to the ProfilePhoto row
    const main = await tx.profilePhoto.findFirst({ where: { userId }, orderBy: { sortKey: "desc" }, select: { uploadId: true } });
    await tx.user.update({ where: { id: userId }, data: { avatarUrl: main ? mediaUrl(main.uploadId) : null } });
    return [photo.upload.path, photo.upload.thumbPath, photo.upload.mediumPath].filter((p): p is string => Boolean(p));
  });
  await deleteFiles(files);
}

// Everyone who may see my photos: my contacts and the people who have me as a
// contact, members of my DIRECT/GROUP conversations, admins of channels I'm in;
// and me (other tabs/devices).
export async function profileAudience(userId: string): Promise<string[]> {
  const [members, contactOwners, myContacts] = await Promise.all([
    db.conversationMember.findMany({
      where: {
        conversation: { members: { some: { userId } } },
        // Channels: only their admins (subscribers must not learn who I am).
        OR: [{ conversation: { type: { notIn: ["CHANNEL", "SAVED"] } } }, { conversation: { type: "CHANNEL" }, role: "ADMIN" }],
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.contact.findMany({ where: { contactId: userId }, select: { ownerId: true } }),
    db.contact.findMany({ where: { ownerId: userId }, select: { contactId: true } }),
  ]);
  return [...new Set([userId, ...members.map((m) => m.userId), ...contactOwners.map((c) => c.ownerId), ...myContacts.map((c) => c.contactId)])];
}

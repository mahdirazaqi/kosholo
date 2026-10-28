"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  addProfilePhotos as addInDb,
  deleteProfilePhoto as deleteInDb,
  getProfilePhotos as getInDb,
  ProfilePhotoError,
  profileAudience,
  setMainProfilePhoto as setMainInDb,
} from "@/lib/profile-photos";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { userRoom } from "@/lib/realtime/events";
import { isUuid } from "@/lib/realtime/membership";
import type { ProfilePhotoItem } from "@/lib/types/profile";
import { tryGetIO } from "@/server/io";

// Every action: requireUser → the change is for the signed-in user's own
// gallery only (the owner is never taken from the client) → user:updated with
// the new avatar and a photosVersion to everyone who may see the photos.

export type PhotoResult = { ok: true; photos: ProfilePhotoItem[] } | { ok: false; error: string };

async function run(work: (userId: string) => Promise<void>): Promise<PhotoResult> {
  const me = await requireUser();
  const key = `profile-photos:${me.id}`;
  if (isRateLimited(key, LIMITS.profilePhotos)) return { ok: false, error: RATE_LIMIT_ERROR };
  recordHit(key, LIMITS.profilePhotos);
  try {
    await work(me.id);
    const avatar = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { avatarUrl: true } });
    const audience = await profileAudience(me.id);
    tryGetIO()?.to(audience.map(userRoom)).emit("user:updated", {
      userId: me.id,
      avatarUrl: avatar.avatarUrl,
      photosVersion: Date.now(),
    });
    revalidatePath("/", "layout");
    return { ok: true, photos: (await getInDb(me.id, me.id)) ?? [] };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProfilePhotoError) return { ok: false, error: error.message };
    logger.error("profile-photos", "failed", error);
    return { ok: false, error: "Something went wrong, please try again" };
  }
}

const parse = (id: unknown) => {
  if (!isUuid(id)) throw new ProfilePhotoError("Photo not found");
  return id;
};

// The photos are chosen in order: the first becomes the main photo.
export async function addProfilePhotos(uploadIds: string[]) {
  return run((userId) => {
    if (!Array.isArray(uploadIds) || uploadIds.length > 30) throw new ProfilePhotoError("You can have up to 30 profile photos");
    return addInDb(userId, uploadIds.map(parse));
  });
}

export async function setMainProfilePhoto(photoId: string) {
  return run((userId) => setMainInDb(userId, parse(photoId)));
}

export async function deleteProfilePhoto(photoId: string) {
  return run((userId) => deleteInDb(userId, parse(photoId)));
}

// A gallery (mine, or one I may see). null = not allowed: the caller shows nothing.
export async function getProfilePhotos(userId: string): Promise<ProfilePhotoItem[] | null> {
  const me = await requireUser();
  return getInDb(me.id, userId);
}

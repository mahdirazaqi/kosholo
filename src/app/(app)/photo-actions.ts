"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { GroupError, setGroupPhoto as setGroupPhotoInDb } from "@/lib/chat/groups";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/media/serialize";
import { emitToMembers } from "@/lib/realtime/emit";
import { userRoom } from "@/lib/realtime/events";
import { isUuid } from "@/lib/realtime/membership";
import { tryGetIO } from "@/server/io";
import { logger } from "@/lib/logger";

type Result = { ok: true; avatarUrl: string | null } | { ok: false; error: string };

const BAD_UPLOAD = "Photo not found, please choose it again";

// The avatar upload must be mine and of kind AVATAR (processed to 512/128 WebP).
async function avatarUrlFor(uploadId: string | null, ownerId: string) {
  if (uploadId === null) return null;
  if (!isUuid(uploadId)) throw new GroupError(BAD_UPLOAD);
  const upload = await db.upload.findFirst({ where: { id: uploadId, ownerId, kind: "AVATAR" }, select: { id: true } });
  if (!upload) throw new GroupError(BAD_UPLOAD);
  return mediaUrl(upload.id);
}

export async function setProfilePhoto(uploadId: string | null): Promise<Result> {
  const me = await requireUser();
  try {
    const avatarUrl = await avatarUrlFor(uploadId, me.id);
    await db.user.update({ where: { id: me.id }, data: { avatarUrl } });

    // Everyone who can see me: people I share a conversation with, people who
    // have me as a contact, and my own other tabs/devices.
    const [members, contactOwners] = await Promise.all([
      db.conversationMember.findMany({
        where: { conversation: { members: { some: { userId: me.id } } } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      db.contact.findMany({ where: { contactId: me.id }, select: { ownerId: true } }),
    ]);
    const audience = new Set([me.id, ...members.map((m) => m.userId), ...contactOwners.map((c) => c.ownerId)]);
    tryGetIO()?.to([...audience].map(userRoom)).emit("user:updated", { userId: me.id, avatarUrl });

    revalidatePath("/", "layout");
    return { ok: true, avatarUrl };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof GroupError) return { ok: false, error: error.message };
    logger.error("setProfilePhoto", "failed", error);
    return { ok: false, error: "Couldn't change the photo" };
  }
}

// Admins only (checked inside the transaction); records a photo_changed system message.
export async function setGroupPhoto(conversationId: string, uploadId: string | null): Promise<Result> {
  const me = await requireUser();
  try {
    if (!isUuid(conversationId)) throw new GroupError("Group not found");
    const avatarUrl = await avatarUrlFor(uploadId, me.id);
    const { message } = await setGroupPhotoInDb({ id: me.id, name: me.name }, conversationId, avatarUrl);
    await emitToMembers(conversationId, "message:new", { message, tempId: null });
    await emitToMembers(conversationId, "conversation:updated", { conversationId, avatarUrl });
    revalidatePath("/");
    return { ok: true, avatarUrl };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof GroupError) return { ok: false, error: error.message };
    logger.error("setGroupPhoto", "failed", error);
    return { ok: false, error: "Couldn't change the photo" };
  }
}

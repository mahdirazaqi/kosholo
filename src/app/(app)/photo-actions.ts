"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ChannelError, setChannelPhoto as setChannelPhotoInDb } from "@/lib/chat/channels";
import { GroupError, setGroupPhoto as setGroupPhotoInDb } from "@/lib/chat/groups";
import { db } from "@/lib/db";
import { AvatarUploadError, avatarUrlFor } from "@/lib/media/avatar-upload";
import { emitMessageNew, emitToMembers } from "@/lib/realtime/emit";
import { userRoom } from "@/lib/realtime/events";
import { isUuid } from "@/lib/realtime/membership";
import { tryGetIO } from "@/server/io";
import { logger } from "@/lib/logger";

type Result = { ok: true; avatarUrl: string | null } | { ok: false; error: string };

export async function setProfilePhoto(uploadId: string | null): Promise<Result> {
  const me = await requireUser();
  try {
    const avatarUrl = await avatarUrlFor(uploadId, me.id);
    await db.user.update({ where: { id: me.id }, data: { avatarUrl } });

    // Everyone who can see me: people I share a conversation with, people who
    // have me as a contact, and my own other tabs/devices.
    const [members, contactOwners] = await Promise.all([
      db.conversationMember.findMany({
        where: {
          conversation: { members: { some: { userId: me.id } } },
          // Channels: only their admins hear about me (subscribers must not
          // learn an admin's identity from this event).
          OR: [{ conversation: { type: { not: "CHANNEL" } } }, { role: "ADMIN" }],
        },
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
    if (error instanceof GroupError || error instanceof AvatarUploadError || error instanceof ChannelError) return { ok: false, error: error.message };
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
    await emitMessageNew(conversationId, message, null);
    await emitToMembers(conversationId, "conversation:updated", { conversationId, avatarUrl });
    revalidatePath("/");
    return { ok: true, avatarUrl };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof GroupError || error instanceof AvatarUploadError || error instanceof ChannelError) return { ok: false, error: error.message };
    logger.error("setGroupPhoto", "failed", error);
    return { ok: false, error: "Couldn't change the photo" };
  }
}

// Channel admins only; records a photo_changed system message.
export async function setChannelPhoto(conversationId: string, uploadId: string | null): Promise<Result> {
  const me = await requireUser();
  try {
    if (!isUuid(conversationId)) throw new ChannelError("Channel not found");
    const avatarUrl = await avatarUrlFor(uploadId, me.id);
    const { message } = await setChannelPhotoInDb({ id: me.id, name: me.name }, conversationId, avatarUrl);
    await emitMessageNew(conversationId, message, null);
    await emitToMembers(conversationId, "conversation:updated", { conversationId, avatarUrl });
    revalidatePath("/");
    return { ok: true, avatarUrl };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ChannelError || error instanceof AvatarUploadError) return { ok: false, error: error.message };
    logger.error("setChannelPhoto", "failed", error);
    return { ok: false, error: "Couldn't change the photo" };
  }
}

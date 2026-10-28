"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ChannelError, setChannelPhoto as setChannelPhotoInDb } from "@/lib/chat/channels";
import { GroupError, setGroupPhoto as setGroupPhotoInDb } from "@/lib/chat/groups";
import { AvatarUploadError, avatarUrlFor } from "@/lib/media/avatar-upload";
import { emitMessageNew, emitToMembers } from "@/lib/realtime/emit";
import { isUuid } from "@/lib/realtime/membership";
import { logger } from "@/lib/logger";

type Result = { ok: true; avatarUrl: string | null } | { ok: false; error: string };

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

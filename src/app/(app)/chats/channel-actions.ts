"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as channels from "@/lib/chat/channels";
import { ChannelError } from "@/lib/chat/channels";
import type { Actor } from "@/lib/chat/groups";
import { unlinkPurgedFiles } from "@/lib/chat/purge";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AvatarUploadError, avatarUrlFor } from "@/lib/media/avatar-upload";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit, resetHits } from "@/lib/rate-limit";
import {
  emitConversationDeleted,
  emitMessageNew,
  emitRemoved,
  emitToAdmins,
  emitToMembers,
  emitToUsers,
} from "@/lib/realtime/emit";
import { invalidateMembership } from "@/lib/realtime/membership";
import { getClientIp } from "@/lib/request";
import type { ChannelMembersPage, ChatMessage } from "@/lib/types/chat";
import {
  addSubscribersSchema,
  createChannelSchema,
  transferOwnershipSchema,
  updateChannelSchema,
} from "@/lib/validations/channels";
import { userIdSchema } from "@/lib/validations/contacts";
import { memberRoleSchema } from "@/lib/validations/groups";

// Every action: requireUser → validate → transactional change with permission
// checks (lib/chat/channels.ts) → realtime events. Nothing here trusts the
// client, and nothing sent to subscribers names another subscriber or admin.

export type ChannelActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong, please try again";

async function currentActor(): Promise<Actor> {
  const user = await requireUser();
  return { id: user.id, name: user.name };
}

async function run<T extends object>(work: () => Promise<T>): Promise<ChannelActionResult<T>> {
  try {
    const result = await work();
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (error) {
    unstable_rethrow(error); // redirects from requireUser() etc.
    if (error instanceof ChannelError || error instanceof AvatarUploadError) return { ok: false, error: error.message };
    logger.error("channel-action", "failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

function parseId(value: unknown) {
  const parsed = userIdSchema.safeParse(value);
  if (!parsed.success) throw new ChannelError("Invalid request");
  return parsed.data;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }) {
  if (!result.success) throw new ChannelError(result.error.issues[0].message);
  return result.data;
}

async function broadcast(conversationId: string, message: ChatMessage | null) {
  if (message) await emitMessageNew(conversationId, message, null);
}

// Admins refetch the people lists; subscribers are told nothing about them.
async function notifyAdminsOfMembers(conversationId: string) {
  const memberCount = await db.conversationMember.count({ where: { conversationId } });
  await emitToAdmins(conversationId, "conversation:updated", { conversationId, membersChanged: true, memberCount });
}

export async function createChannel(input: {
  title: string;
  description?: string | null;
  avatarUploadId?: string | null;
  memberIds: string[];
}) {
  return run(async () => {
    const actor = await currentActor();
    const data = parse(createChannelSchema.safeParse(input));
    const avatarUrl = await avatarUrlFor(data.avatarUploadId, actor.id);
    const { conversationId, message } = await channels.createChannel(
      actor,
      { title: data.title, description: data.description, avatarUrl },
      data.memberIds,
    );
    // The "created" post reaches every user room; clients that don't know the
    // channel fetch its row, so it appears in their lists at once.
    await broadcast(conversationId, message);
    return { conversationId };
  });
}

export async function updateChannel(
  conversationId: string,
  changes: { title?: string; description?: string | null; signMessages?: boolean },
) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const parsed = parse(updateChannelSchema.safeParse(changes));
    const { message, changed } = await channels.updateChannel(actor, id, parsed);
    await broadcast(id, message);
    const payload = {
      conversationId: id,
      ...(typeof changed.title === "string" ? { title: changed.title } : {}),
      ...(changed.description !== undefined ? { description: changed.description as string | null } : {}),
      ...(typeof changed.signMessages === "boolean" ? { signMessages: changed.signMessages } : {}),
    };
    if (Object.keys(payload).length > 1) await emitToMembers(id, "conversation:updated", payload);
    return {};
  });
}

export async function addSubscribers(conversationId: string, userIds: string[]) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const ids = parse(addSubscribersSchema.safeParse(userIds));
    const { addedIds } = await channels.addSubscribers(actor, id, ids);
    invalidateMembership(id); // so the new subscribers are known to the socket server
    // No system message: the channel just shows up in their lists.
    emitToUsers(addedIds, "conversation:joined", { conversationId: id });
    await notifyAdminsOfMembers(id);
    return { added: addedIds.length };
  });
}

export async function removeSubscriber(conversationId: string, userId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const targetId = parseId(userId);
    const { purged } = await channels.removeSubscriber(actor, id, targetId);
    await unlinkPurgedFiles(purged);
    emitRemoved(id, [targetId], "removed"); // also invalidates the membership cache
    await notifyAdminsOfMembers(id);
    return {};
  });
}

export async function setChannelRole(conversationId: string, userId: string, role: "ADMIN" | "MEMBER") {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const targetId = parseId(userId);
    const parsedRole = memberRoleSchema.safeParse(role);
    if (!parsedRole.success) throw new ChannelError("Invalid request");
    const { changed } = await channels.setChannelRole(actor, id, targetId, parsedRole.data);
    if (changed) {
      invalidateMembership(id); // typing and presence checks read roles from it
      emitToUsers([targetId], "conversation:updated", { conversationId: id, myRole: parsedRole.data });
      await notifyAdminsOfMembers(id);
    }
    return {};
  });
}

export async function leaveChannel(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const { heirId, purged } = await channels.leaveChannel(actor, id);
    await unlinkPurgedFiles(purged);
    emitRemoved(id, [actor.id], "left");
    if (heirId) emitToUsers([heirId], "conversation:updated", { conversationId: id, isOwner: true });
    await notifyAdminsOfMembers(id);
    return {};
  });
}

export async function transferOwnership(conversationId: string, input: { newOwnerId: string; password: string }) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const { newOwnerId, password } = parse(transferOwnershipSchema.safeParse(input));

    // Re-authenticate with the owner's password, with a failure limit.
    const limitKey = `owner-password:${actor.id}`;
    if (isRateLimited(limitKey, LIMITS.passwordFailures)) throw new ChannelError(RATE_LIMIT_ERROR);
    const record = await db.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } });
    if (!record || !(await bcrypt.compare(password, record.passwordHash))) {
      recordHit(limitKey, LIMITS.passwordFailures);
      throw new ChannelError("Incorrect password");
    }
    resetHits(limitKey);

    await channels.transferOwnership(actor, id, newOwnerId);
    emitToUsers([actor.id], "conversation:updated", { conversationId: id, isOwner: false });
    emitToUsers([newOwnerId], "conversation:updated", { conversationId: id, isOwner: true });
    await notifyAdminsOfMembers(id);
    return {};
  });
}

export async function deleteChannel(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const { memberIds, purged } = await channels.deleteChannel(actor, id);
    await unlinkPurgedFiles(purged);
    await emitConversationDeleted(id, memberIds);
    return {};
  });
}

// The invite link's token (created on first use). Admins only.
export async function getInviteToken(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    return { token: await channels.ensureInviteToken(actor, parseId(conversationId), false) };
  });
}

// Replaces the token: the old link stops working immediately.
export async function resetInviteToken(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    return { token: await channels.ensureInviteToken(actor, parseId(conversationId), true) };
  });
}

// Subscribers, a page at a time, for admins only.
export async function listChannelMembers(
  conversationId: string,
  query = "",
  cursor: string | null = null,
): Promise<ChannelMembersPage | null> {
  try {
    const actor = await currentActor();
    const id = parseId(conversationId);
    return await channels.listChannelMembers(actor, id, {
      query: typeof query === "string" ? query : "",
      cursor: typeof cursor === "string" && cursor.length < 100 ? cursor : null,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof ChannelError)) logger.error("channel-action", "listChannelMembers failed", error);
    return null;
  }
}

// /join/[token]: becomes a subscriber. Every attempt counts against the
// per-user and per-IP limits, so tokens can't be guessed or hammered.
export async function joinChannel(token: string) {
  return run(async () => {
    const actor = await currentActor();
    const ip = await getClientIp();
    const keys = [`join:${actor.id}`, `join-ip:${ip}`];
    if (keys.some((key) => isRateLimited(key, LIMITS.channelJoins))) throw new ChannelError(RATE_LIMIT_ERROR);
    for (const key of keys) recordHit(key, LIMITS.channelJoins);

    const { conversationId, joined } = await channels.joinChannel(actor.id, token);
    if (joined) {
      invalidateMembership(conversationId);
      emitToUsers([actor.id], "conversation:joined", { conversationId });
      await notifyAdminsOfMembers(conversationId);
    }
    return { conversationId };
  });
}

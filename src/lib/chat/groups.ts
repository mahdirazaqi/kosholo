import "server-only";

import type { MemberRole, Prisma } from "@/generated/prisma/client";
import { messageSelect, toChatMember, toChatMessage, conversationSelect } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/numbers";
import type { ChatMember, ChatMessage, GroupInfo, SystemMeta } from "@/lib/types/chat";
import { MAX_GROUP_MEMBERS } from "@/lib/validations/groups";
import { userIdSchema } from "@/lib/validations/contacts";

// Group rules. Every permission check happens here, inside the transaction
// that performs the change. Callers (group-actions.ts) emit realtime events.

export class GroupError extends Error {}

export type Actor = { id: string; name: string };
type Tx = Prisma.TransactionClient;

const NOT_FOUND = "Group not found";
const ADMINS_ONLY = "Only group admins can do this";

async function membershipOf(tx: Tx, conversationId: string, userId: string) {
  if (!userIdSchema.safeParse(conversationId).success) throw new GroupError(NOT_FOUND);
  const member = await tx.conversationMember.findFirst({
    where: { conversationId, userId, conversation: { type: "GROUP" } },
    select: { role: true, joinedAt: true },
  });
  if (!member) throw new GroupError(NOT_FOUND);
  return member;
}

async function requireAdmin(tx: Tx, conversationId: string, userId: string) {
  const member = await membershipOf(tx, conversationId, userId);
  if (member.role !== "ADMIN") throw new GroupError(ADMINS_ONLY);
  return member;
}

// Records the event as a SYSTEM message and bumps the conversation.
async function recordEvent(tx: Tx, conversationId: string, actor: Actor, meta: Omit<SystemMeta, "actorId" | "actorName">, at = new Date()) {
  const row = await tx.message.create({
    data: {
      conversationId,
      senderId: actor.id,
      type: "SYSTEM",
      meta: { ...meta, actorId: actor.id, actorName: actor.name },
      createdAt: at,
    },
    select: messageSelect,
  });
  await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: at } });
  return toChatMessage(row);
}

async function namesOf(tx: Tx, userIds: string[]) {
  const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const byId = new Map(users.map((user) => [user.id, user.name]));
  return userIds.map((id) => byId.get(id) ?? "");
}

// Only the actor's contacts can be added.
async function assertContacts(tx: Tx, actorId: string, userIds: string[]) {
  if (userIds.includes(actorId)) throw new GroupError("You can't add yourself");
  const count = await tx.contact.count({ where: { ownerId: actorId, contactId: { in: userIds } } });
  if (count !== userIds.length) throw new GroupError("Only your contacts can be added to the group");
}

export async function createGroup(actor: Actor, title: string, memberIds: string[]) {
  return db.$transaction(async (tx) => {
    await assertContacts(tx, actor.id, memberIds);
    const conversation = await tx.conversation.create({
      data: {
        type: "GROUP",
        title,
        createdById: actor.id,
        members: {
          create: [
            { userId: actor.id, role: "ADMIN" },
            ...memberIds.map((userId) => ({ userId, role: "MEMBER" as const })),
          ],
        },
      },
      select: { id: true },
    });
    const message = await recordEvent(tx, conversation.id, actor, { event: "created", newTitle: title });
    return { conversationId: conversation.id, message };
  });
}

export async function renameGroup(actor: Actor, conversationId: string, title: string) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { title: true } });
    if (current.title === title) return { message: null };
    await tx.conversation.update({ where: { id: conversationId }, data: { title } });
    const message = await recordEvent(tx, conversationId, actor, { event: "renamed", newTitle: title });
    return { message };
  });
}

export async function addMembers(actor: Actor, conversationId: string, userIds: string[]) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    await assertContacts(tx, actor.id, userIds);
    const existing = await tx.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const newIds = userIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) throw new GroupError("These people are already members of the group");
    if (existing.length + newIds.length > MAX_GROUP_MEMBERS) {
      throw new GroupError(`A group can have up to ${formatNumber(MAX_GROUP_MEMBERS)} members`);
    }
    await tx.conversationMember.createMany({
      data: newIds.map((userId) => ({ conversationId, userId, role: "MEMBER" as const })),
    });
    const message = await recordEvent(tx, conversationId, actor, {
      event: "member_added",
      targetIds: newIds,
      targetNames: await namesOf(tx, newIds),
    });
    return { message, addedIds: newIds };
  });
}

export async function removeMember(actor: Actor, conversationId: string, userId: string) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    if (userId === actor.id) throw new GroupError("Use \"Leave group\" to leave");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true },
    });
    if (!target) throw new GroupError("This user isn't a member of the group");
    if (target.role === "ADMIN") throw new GroupError("Remove this user as admin first");
    await tx.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
    const message = await recordEvent(tx, conversationId, actor, {
      event: "member_removed",
      targetIds: [userId],
      targetNames: await namesOf(tx, [userId]),
    });
    return { message };
  });
}

// Any member can leave. The last admin leaving promotes the longest-standing
// member; the last member leaving deletes the conversation.
export async function leaveGroup(actor: Actor, conversationId: string) {
  return db.$transaction(async (tx) => {
    const me = await membershipOf(tx, conversationId, actor.id);
    const others = await tx.conversationMember.findMany({
      where: { conversationId, userId: { not: actor.id } },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true, role: true },
    });

    if (others.length === 0) {
      await tx.conversation.delete({ where: { id: conversationId } });
      return { deleted: true as const, messages: [] as ChatMessage[] };
    }

    await tx.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
    });
    const messages = [await recordEvent(tx, conversationId, actor, { event: "member_left" })];

    if (me.role === "ADMIN" && !others.some((member) => member.role === "ADMIN")) {
      const heir = others[0];
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: heir.userId } },
        data: { role: "ADMIN" },
      });
      // A moment later so it sorts after "left".
      messages.push(
        await recordEvent(
          tx,
          conversationId,
          actor,
          { event: "admin_promoted", auto: true, targetIds: [heir.userId], targetNames: await namesOf(tx, [heir.userId]) },
          new Date(Date.now() + 1),
        ),
      );
    }
    return { deleted: false as const, messages };
  });
}

export async function setMemberRole(actor: Actor, conversationId: string, userId: string, role: MemberRole) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    if (userId === actor.id) throw new GroupError("You can't change your own role");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true },
    });
    if (!target) throw new GroupError("This user isn't a member of the group");
    if (target.role === role) return { message: null };
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { role },
    });
    const message = await recordEvent(tx, conversationId, actor, {
      event: role === "ADMIN" ? "admin_promoted" : "admin_demoted",
      targetIds: [userId],
      targetNames: await namesOf(tx, [userId]),
    });
    return { message };
  });
}

// avatarUrl: "/api/media/{uploadId}" or null to remove.
export async function setGroupPhoto(actor: Actor, conversationId: string, avatarUrl: string | null) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    await tx.conversation.update({ where: { id: conversationId }, data: { avatarUrl } });
    const message = await recordEvent(tx, conversationId, actor, {
      event: "photo_changed",
      ...(avatarUrl ? {} : { removed: true }),
    });
    return { message };
  });
}

export async function deleteGroup(actor: Actor, conversationId: string) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    const members = await tx.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    await tx.conversation.delete({ where: { id: conversationId } });
    return { memberIds: members.map((m) => m.userId) };
  });
}

export async function getMembers(conversationId: string): Promise<ChatMember[]> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { members: conversationSelect.members },
  });
  return conversation?.members.map(toChatMember) ?? [];
}

export async function getGroupInfo(conversationId: string, userId: string): Promise<GroupInfo | null> {
  if (!userIdSchema.safeParse(conversationId).success) return null;
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, type: "GROUP", members: { some: { userId } } },
    select: { ...conversationSelect, createdAt: true },
  });
  if (!conversation) return null;
  const me = conversation.members.find((member) => member.userId === userId);
  return {
    id: conversation.id,
    title: conversation.title ?? "Group",
    avatarUrl: conversation.avatarUrl,
    createdAt: conversation.createdAt.toISOString(),
    members: conversation.members.map(toChatMember),
    myRole: me?.role ?? "MEMBER",
  };
}

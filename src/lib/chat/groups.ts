import "server-only";

import type { MemberRole, Prisma } from "@/generated/prisma/client";
import { messageSelect, toChatMember, toChatMessage, conversationSelect } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import type { ChatMember, ChatMessage, GroupInfo, SystemMeta } from "@/lib/types/chat";
import { MAX_GROUP_MEMBERS } from "@/lib/validations/groups";
import { userIdSchema } from "@/lib/validations/contacts";

// Group rules. Every permission check happens here, inside the transaction
// that performs the change. Callers (group-actions.ts) emit realtime events.

export class GroupError extends Error {}

export type Actor = { id: string; name: string };
type Tx = Prisma.TransactionClient;

const NOT_FOUND = "گروه پیدا نشد";
const ADMINS_ONLY = "فقط ادمین‌های گروه می‌توانند این کار را انجام دهند";

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
  if (userIds.includes(actorId)) throw new GroupError("نمی‌توانید خودتان را اضافه کنید");
  const count = await tx.contact.count({ where: { ownerId: actorId, contactId: { in: userIds } } });
  if (count !== userIds.length) throw new GroupError("فقط مخاطبین شما را می‌توان به گروه اضافه کرد");
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
    if (newIds.length === 0) throw new GroupError("این افراد از قبل عضو گروه هستند");
    if (existing.length + newIds.length > MAX_GROUP_MEMBERS) {
      throw new GroupError(`گروه حداکثر ${MAX_GROUP_MEMBERS.toLocaleString("fa-IR")} عضو دارد`);
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
    if (userId === actor.id) throw new GroupError("برای خروج از «ترک گروه» استفاده کنید");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true },
    });
    if (!target) throw new GroupError("این کاربر عضو گروه نیست");
    if (target.role === "ADMIN") throw new GroupError("ابتدا ادمینی این کاربر را بردارید");
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
    if (userId === actor.id) throw new GroupError("نمی‌توانید نقش خودتان را تغییر دهید");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true },
    });
    if (!target) throw new GroupError("این کاربر عضو گروه نیست");
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
    title: conversation.title ?? "گروه",
    avatarUrl: conversation.avatarUrl,
    createdAt: conversation.createdAt.toISOString(),
    members: conversation.members.map(toChatMember),
    myRole: me?.role ?? "MEMBER",
  };
}

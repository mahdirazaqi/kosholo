import "server-only";

import { randomBytes } from "node:crypto";
import type { MemberRole, Prisma } from "@/generated/prisma/client";
import { recordEvent, type Actor } from "@/lib/chat/groups";
import { collectGarbage, purgeConversation } from "@/lib/chat/purge";
import { toChatMember } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import { publicUserSelect } from "@/lib/users";
import type { ChannelInfo, ChannelMember, ChannelMembersPage, ChatMessage } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";

// Channel rules. Like groups.ts, every permission check runs inside the
// transaction that performs the change; callers (channel-actions.ts) emit the
// realtime events. See the permissions table in CLAUDE.md.
//
// | Action                                  | Member | Admin | Owner |
// | Read, mute, clear for me, leave         |   ✓    |   ✓   |  ✓*   |
// | Post, reply, type                       |        |   ✓   |  ✓    |
// | Delete posts / clear for everyone       |        |   ✓   |  ✓    |
// | See members, add, remove members        |        |   ✓   |  ✓    |
// | Edit info, signature, invite link       |        |   ✓   |  ✓    |
// | Promote a member to admin               |        |   ✓   |  ✓    |
// | Demote/remove an admin, transfer, delete|        |       |  ✓    |
// (*) the owner leaves only after another admin exists: ownership moves to the
// longest-standing admin.

export class ChannelError extends Error {}

type Tx = Prisma.TransactionClient;

const NOT_FOUND = "Channel not found";
const ADMINS_ONLY = "Only channel admins can do this";
const OWNER_ONLY = "Only the channel owner can do this";
export const MEMBERS_PAGE_SIZE = 50;

export const maxChannelMembers = () => {
  const value = Number(process.env.MAX_CHANNEL_MEMBERS);
  return Number.isInteger(value) && value > 0 ? value : 10_000;
};

// 24 random bytes = 192 bits from the OS CSPRNG, as 32 URL-safe characters.
export const createInviteToken = () => randomBytes(24).toString("base64url");

async function membershipOf(tx: Tx, conversationId: string, userId: string) {
  if (!userIdSchema.safeParse(conversationId).success) throw new ChannelError(NOT_FOUND);
  const member = await tx.conversationMember.findFirst({
    where: { conversationId, userId, conversation: { type: "CHANNEL" } },
    select: { role: true, joinedAt: true, conversation: { select: { ownerId: true } } },
  });
  if (!member) throw new ChannelError(NOT_FOUND);
  return { role: member.role, joinedAt: member.joinedAt, isOwner: member.conversation.ownerId === userId };
}

async function requireAdmin(tx: Tx, conversationId: string, userId: string) {
  const me = await membershipOf(tx, conversationId, userId);
  if (me.role !== "ADMIN") throw new ChannelError(ADMINS_ONLY);
  return me;
}

async function requireOwner(tx: Tx, conversationId: string, userId: string) {
  const me = await membershipOf(tx, conversationId, userId);
  if (!me.isOwner) throw new ChannelError(OWNER_ONLY);
  return me;
}

// Only the actor's contacts can be added.
async function assertContacts(tx: Tx, actorId: string, userIds: string[]) {
  if (userIds.includes(actorId)) throw new ChannelError("You can't add yourself");
  const count = await tx.contact.count({ where: { ownerId: actorId, contactId: { in: userIds } } });
  if (count !== userIds.length) throw new ChannelError("Only your contacts can be added to the channel");
}

async function assertCapacity(tx: Tx, conversationId: string, adding: number) {
  const current = await tx.conversationMember.count({ where: { conversationId } });
  if (current + adding > maxChannelMembers()) throw new ChannelError("This channel is full");
}

export type ChannelDetails = { title: string; description: string | null };

export async function createChannel(
  actor: Actor,
  details: ChannelDetails & { avatarUrl: string | null },
  memberIds: string[],
) {
  return db.$transaction(async (tx) => {
    await assertContacts(tx, actor.id, memberIds);
    if (memberIds.length + 1 > maxChannelMembers()) throw new ChannelError("This channel is full");
    const conversation = await tx.conversation.create({
      data: {
        type: "CHANNEL",
        title: details.title,
        description: details.description,
        avatarUrl: details.avatarUrl,
        createdById: actor.id,
        ownerId: actor.id,
        members: {
          create: [
            { userId: actor.id, role: "ADMIN" },
            ...memberIds.map((userId) => ({ userId, role: "MEMBER" as const })),
          ],
        },
      },
      select: { id: true },
    });
    const message = await recordEvent(tx, conversation.id, actor, { event: "created", newTitle: details.title });
    return { conversationId: conversation.id, message };
  });
}

// Title (system message), description and the signature switch.
export async function updateChannel(
  actor: Actor,
  conversationId: string,
  changes: { title?: string; description?: string | null; signMessages?: boolean },
) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    const current = await tx.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { title: true, description: true, signMessages: true },
    });
    const data: Prisma.ConversationUpdateInput = {};
    if (changes.title !== undefined && changes.title !== current.title) data.title = changes.title;
    if (changes.description !== undefined && changes.description !== current.description) data.description = changes.description;
    if (changes.signMessages !== undefined && changes.signMessages !== current.signMessages) data.signMessages = changes.signMessages;
    if (Object.keys(data).length === 0) return { message: null as ChatMessage | null, changed: {} as typeof data };
    await tx.conversation.update({ where: { id: conversationId }, data });
    const message =
      typeof data.title === "string"
        ? await recordEvent(tx, conversationId, actor, { event: "renamed", newTitle: data.title })
        : null;
    return { message, changed: data };
  });
}

// avatarUrl: "/api/media/{uploadId}" or null to remove.
export async function setChannelPhoto(actor: Actor, conversationId: string, avatarUrl: string | null) {
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

// ---- Subscribers ----

export async function addSubscribers(actor: Actor, conversationId: string, userIds: string[]) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    await assertContacts(tx, actor.id, userIds);
    const existing = await tx.conversationMember.findMany({
      where: { conversationId, userId: { in: userIds } },
      select: { userId: true },
    });
    const known = new Set(existing.map((member) => member.userId));
    const newIds = userIds.filter((id) => !known.has(id));
    if (newIds.length === 0) throw new ChannelError("These people are already subscribed");
    await assertCapacity(tx, conversationId, newIds.length);
    await tx.conversationMember.createMany({
      data: newIds.map((userId) => ({ conversationId, userId, role: "MEMBER" as const })),
      skipDuplicates: true,
    });
    return { addedIds: newIds };
  });
}

export async function removeSubscriber(actor: Actor, conversationId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const me = await requireAdmin(tx, conversationId, actor.id);
    if (userId === actor.id) throw new ChannelError("Use \"Leave channel\" to leave");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true, conversation: { select: { ownerId: true } } },
    });
    if (!target) throw new ChannelError("This user isn't subscribed to the channel");
    if (target.conversation.ownerId === userId) throw new ChannelError("The owner can't be removed");
    if (target.role === "ADMIN" && !me.isOwner) throw new ChannelError(OWNER_ONLY);
    await tx.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
    return { purged: await collectGarbage(tx, conversationId) };
  });
}

// Promote: any admin. Demote: the owner. Never the owner, never yourself.
export async function setChannelRole(actor: Actor, conversationId: string, userId: string, role: MemberRole) {
  return db.$transaction(async (tx) => {
    const me = await requireAdmin(tx, conversationId, actor.id);
    if (userId === actor.id) throw new ChannelError("You can't change your own role");
    if (role === "MEMBER" && !me.isOwner) throw new ChannelError(OWNER_ONLY);
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true, conversation: { select: { ownerId: true } } },
    });
    if (!target) throw new ChannelError("This user isn't subscribed to the channel");
    if (target.conversation.ownerId === userId) throw new ChannelError("The owner's role can't be changed");
    if (target.role === role) return { changed: false };
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { role },
    });
    return { changed: true };
  });
}

// Members leave freely. The owner leaves only if another admin can inherit the
// channel (the longest-standing one).
export async function leaveChannel(actor: Actor, conversationId: string) {
  return db.$transaction(async (tx) => {
    const me = await membershipOf(tx, conversationId, actor.id);
    let heirId: string | null = null;
    if (me.isOwner) {
      const heir = await tx.conversationMember.findFirst({
        where: { conversationId, role: "ADMIN", userId: { not: actor.id } },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        select: { userId: true },
      });
      if (!heir) throw new ChannelError("Appoint another admin first or delete the channel");
      heirId = heir.userId;
      await tx.conversation.update({ where: { id: conversationId }, data: { ownerId: heirId } });
    }
    await tx.messageHide.deleteMany({ where: { userId: actor.id, message: { conversationId } } });
    await tx.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
    return { heirId, wasAdmin: me.role === "ADMIN", purged: await collectGarbage(tx, conversationId) };
  });
}

// The new owner must already be an admin. The old owner stays an admin.
export async function transferOwnership(actor: Actor, conversationId: string, newOwnerId: string) {
  return db.$transaction(async (tx) => {
    await requireOwner(tx, conversationId, actor.id);
    if (newOwnerId === actor.id) throw new ChannelError("You already own this channel");
    const target = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: newOwnerId } },
      select: { role: true },
    });
    if (target?.role !== "ADMIN") throw new ChannelError("Choose one of the channel's admins");
    await tx.conversation.update({ where: { id: conversationId }, data: { ownerId: newOwnerId } });
  });
}

export async function deleteChannel(actor: Actor, conversationId: string) {
  return db.$transaction(async (tx) => {
    await requireOwner(tx, conversationId, actor.id);
    const purged = await purgeConversation(tx, conversationId);
    return { memberIds: purged.deletedConversation?.memberIds ?? [], purged };
  });
}

// ---- Invite links ----

// The current link, created on first use. `reset` replaces it, so the old
// link stops working at once.
export async function ensureInviteToken(actor: Actor, conversationId: string, reset: boolean) {
  return db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { inviteToken: true } });
    if (current.inviteToken && !reset) return current.inviteToken;
    const inviteToken = createInviteToken();
    await tx.conversation.update({ where: { id: conversationId }, data: { inviteToken } });
    return inviteToken;
  });
}

// For /join/[token]: what a non-member may see before joining.
export async function getChannelPreview(token: string, userId: string) {
  if (typeof token !== "string" || token.length < 22 || token.length > 64) return null;
  const channel = await db.conversation.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      title: true,
      avatarUrl: true,
      description: true,
      _count: { select: { members: true } },
      members: { where: { userId }, select: { userId: true } },
    },
  });
  if (!channel) return null;
  return {
    id: channel.id,
    title: channel.title ?? "Channel",
    avatarUrl: channel.avatarUrl,
    description: channel.description,
    memberCount: channel._count.members,
    isMember: channel.members.length > 0,
  };
}

export async function joinChannel(userId: string, token: string) {
  if (typeof token !== "string" || token.length < 22 || token.length > 64) throw new ChannelError(INVALID_LINK);
  return db.$transaction(async (tx) => {
    const channel = await tx.conversation.findUnique({ where: { inviteToken: token }, select: { id: true } });
    if (!channel) throw new ChannelError(INVALID_LINK);
    const already = await tx.conversationMember.count({ where: { conversationId: channel.id, userId } });
    if (already > 0) return { conversationId: channel.id, joined: false };
    await assertCapacity(tx, channel.id, 1);
    await tx.conversationMember.create({ data: { conversationId: channel.id, userId, role: "MEMBER" } });
    return { conversationId: channel.id, joined: true };
  });
}

export const INVALID_LINK = "This invite link isn't valid";

// ---- Reads for admins ----

const toChannelMember = (
  member: { role: MemberRole; joinedAt: Date; user: { id: string; name: string; username: string; avatarUrl: string | null } },
  ownerId: string | null,
): ChannelMember => ({
  ...toChatMember({ ...member, userId: member.user.id, lastReadAt: null, muted: false }),
  isOwner: member.user.id === ownerId,
});

export async function getChannelInfo(conversationId: string, userId: string): Promise<ChannelInfo | null> {
  if (!userIdSchema.safeParse(conversationId).success) return null;
  const channel = await db.conversation.findFirst({
    where: { id: conversationId, type: "CHANNEL", members: { some: { userId } } },
    select: {
      id: true,
      title: true,
      avatarUrl: true,
      description: true,
      createdAt: true,
      signMessages: true,
      ownerId: true,
      inviteToken: true,
      _count: { select: { members: true } },
      members: { where: { userId }, select: { role: true, muted: true } },
    },
  });
  const me = channel?.members[0];
  if (!channel || !me) return null;
  const isAdmin = me.role === "ADMIN";
  const admins = isAdmin
    ? await db.conversationMember.findMany({
        where: { conversationId, role: "ADMIN" },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        select: { role: true, joinedAt: true, user: { select: publicUserSelect } },
      })
    : [];
  return {
    id: channel.id,
    title: channel.title ?? "Channel",
    avatarUrl: channel.avatarUrl,
    description: channel.description,
    createdAt: channel.createdAt.toISOString(),
    memberCount: channel._count.members,
    signMessages: channel.signMessages,
    muted: me.muted,
    myRole: me.role,
    isOwner: channel.ownerId === userId,
    // The link and the people are admin-only.
    inviteToken: isAdmin ? channel.inviteToken : null,
    admins: admins.map((admin) => toChannelMember(admin, channel.ownerId)),
  };
}

// Subscribers (role MEMBER), a page at a time, optionally filtered by name or
// username. Admins only: this is the only way to list a channel's people.
export async function listChannelMembers(
  actor: Actor,
  conversationId: string,
  { query = "", cursor }: { query?: string; cursor?: string | null } = {},
): Promise<ChannelMembersPage> {
  const ownerId = await db.$transaction(async (tx) => {
    await requireAdmin(tx, conversationId, actor.id);
    return (await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { ownerId: true } })).ownerId;
  });

  const term = query.trim().replace(/^@/, "").slice(0, 50);
  const [iso, id] = cursor?.split("|") ?? [];
  const after = iso && id && !Number.isNaN(new Date(iso).getTime()) ? new Date(iso) : null;
  const rows = await db.conversationMember.findMany({
    where: {
      conversationId,
      role: "MEMBER",
      ...(term
        ? {
            user: {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { username: { contains: term.toLowerCase() } },
              ],
            },
          }
        : {}),
      ...(after && id ? { OR: [{ joinedAt: { gt: after } }, { joinedAt: after, userId: { gt: id } }] } : {}),
    },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    take: MEMBERS_PAGE_SIZE + 1,
    select: { role: true, joinedAt: true, user: { select: publicUserSelect } },
  });
  const page = rows.slice(0, MEMBERS_PAGE_SIZE);
  const last = page.at(-1);
  return {
    members: page.map((row) => toChannelMember(row, ownerId)),
    nextCursor: rows.length > MEMBERS_PAGE_SIZE && last ? `${last.joinedAt.toISOString()}|${last.user.id}` : null,
  };
}

// Whose rooms to tell about membership changes: current admins.
export async function adminIdsOf(conversationId: string) {
  const rows = await db.conversationMember.findMany({
    where: { conversationId, role: "ADMIN" },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { userIdSchema } from "@/lib/validations/contacts";

// THE visibility rule. A message is visible to user U only if:
//   1. U is a current member of its conversation,
//   2. U hasn't deleted it for themselves (no MessageHide row for U), and
//   3. U hasn't cleared the history past it (clearedAt is null or older).
// (1) is `getViewer()` returning a viewer; (2) and (3) are `visibleMessageWhere()`
// for Prisma queries and `visibleSql()` for raw SQL. Every read path uses them.

export type Viewer = { userId: string; clearedAt: Date | null };

type Client = Prisma.TransactionClient | typeof db;

// The member as a viewer, or null if `userId` isn't a current member
// (malformed ids count as "not a member").
export async function getViewer(conversationId: string, userId: string, client: Client = db): Promise<Viewer | null> {
  if (!userIdSchema.safeParse(conversationId).success) return null;
  const member = await client.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { clearedAt: true },
  });
  return member ? { userId, clearedAt: member.clearedAt } : null;
}

// Messages visible to `viewer`. Combine with other conditions through AND, so
// a `createdAt` filter of the caller doesn't overwrite this one.
export function visibleMessageWhere(viewer: Viewer): Prisma.MessageWhereInput {
  return {
    hides: { none: { userId: viewer.userId } },
    ...(viewer.clearedAt ? { createdAt: { gt: viewer.clearedAt } } : {}),
  };
}

// The same rule in SQL: message alias `m` is visible to the member row `cm`
// (conversation_members). Membership itself comes from joining `cm`.
export function visibleSql(m: string, cm: string) {
  const msg = Prisma.raw(m);
  const member = Prisma.raw(cm);
  return Prisma.sql`(${member}.cleared_at IS NULL OR ${msg}.created_at > ${member}.cleared_at)
    AND NOT EXISTS (
      SELECT 1 FROM message_hides h WHERE h.message_id = ${msg}.id AND h.user_id = ${member}.user_id
    )`;
}

// For a message already loaded with its creation time and the users who hid it
// (quotes, per-recipient realtime payloads).
export function isVisibleTo(viewer: Viewer, message: { createdAt: Date; hiddenBy: string[] }) {
  if (message.hiddenBy.includes(viewer.userId)) return false;
  return !viewer.clearedAt || message.createdAt > viewer.clearedAt;
}

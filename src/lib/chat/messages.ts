import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { decodeCursor, type MessageCursor } from "@/lib/chat/cursor";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { attachViews } from "@/lib/chat/views";
import { visibleMessageWhere, type Viewer } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { ChatMessage, MessagesPage } from "@/lib/types/chat";

// Message pagination contract. Every page is oldest → newest and comes with
// `hasOlder` / `hasNewer`, found with the limit + 1 trick (one extra row is read
// and dropped; there is never a COUNT query). The visibility rule and the
// membership check (the `viewer` comes from getViewer()) apply to every query.
//   - no cursor:  the NEWEST messages (the chat opens at the bottom),
//   - `before`:   messages older than the cursor,
//   - `after`:    messages newer than the cursor (a list not attached to the latest),
//   - around(id): the target with ~15 older and ~15 newer ones.
// A cursor is the composite position (createdAt, id), see lib/chat/cursor.ts,
// served by the index (conversationId, createdAt, id).
export const PAGE_SIZE = 30;

const OLDEST_FIRST = [{ createdAt: "asc" as const }, { id: "asc" as const }];
const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

const olderThan = ({ createdAt, id }: MessageCursor): Prisma.MessageWhereInput => ({
  OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
});
const newerThan = ({ createdAt, id }: MessageCursor): Prisma.MessageWhereInput => ({
  OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
});

async function finish(conversationId: string, viewer: Viewer, rows: Parameters<typeof toChatMessage>[0][]) {
  const messages = rows.map((row) => toChatMessage(row, viewer));
  return viewer.conversationType === "CHANNEL" ? attachViews(conversationId, messages) : messages;
}

export async function getMessages(
  conversationId: string,
  viewer: Viewer,
  { before, after, limit = PAGE_SIZE }: { before?: string; after?: string; limit?: number } = {},
): Promise<MessagesPage> {
  const take = Math.min(Math.max(Math.floor(limit), 1), 100);
  const base = (extra?: Prisma.MessageWhereInput): Prisma.MessageWhereInput => ({
    AND: [{ conversationId }, visibleMessageWhere(viewer), ...(extra ? [extra] : [])],
  });

  if (after !== undefined) {
    const cursor = decodeCursor(after);
    if (!cursor) return { messages: [], hasOlder: true, hasNewer: false };
    const rows = await db.message.findMany({
      where: base(newerThan(cursor)),
      orderBy: OLDEST_FIRST,
      take: take + 1,
      select: messageSelect,
    });
    return { messages: await finish(conversationId, viewer, rows.slice(0, take)), hasOlder: true, hasNewer: rows.length > take };
  }

  const cursor = before !== undefined ? decodeCursor(before) : null;
  if (before !== undefined && !cursor) return { messages: [], hasOlder: false, hasNewer: true };
  const rows = await db.message.findMany({
    where: base(cursor ? olderThan(cursor) : undefined),
    orderBy: NEWEST_FIRST,
    take: take + 1,
    select: messageSelect,
  });
  const page = rows.slice(0, take).reverse(); // ascending
  return {
    messages: await finish(conversationId, viewer, page),
    hasOlder: rows.length > take,
    hasNewer: cursor !== null, // paging back from a cursor: the cursor message itself is newer
  };
}

// The window around one message (a reply's original, a forwarded message's
// original, the first unread one): `limit / 2` older, the target, `limit / 2`
// newer. null when the message doesn't exist or isn't visible to the viewer.
export async function getMessagesAround(
  conversationId: string,
  viewer: Viewer,
  messageId: string,
  limit = PAGE_SIZE,
): Promise<MessagesPage | null> {
  const half = Math.max(Math.floor(limit / 2), 1);
  const where = (extra?: Prisma.MessageWhereInput): Prisma.MessageWhereInput => ({
    AND: [{ conversationId }, visibleMessageWhere(viewer), ...(extra ? [extra] : [])],
  });
  const target = await db.message.findFirst({ where: where({ id: messageId }), select: messageSelect });
  if (!target) return null;
  const cursor = { createdAt: target.createdAt, id: target.id };
  const [older, newer] = await Promise.all([
    db.message.findMany({ where: where(olderThan(cursor)), orderBy: NEWEST_FIRST, take: half + 1, select: messageSelect }),
    db.message.findMany({ where: where(newerThan(cursor)), orderBy: OLDEST_FIRST, take: half + 1, select: messageSelect }),
  ]);
  const rows = [...older.slice(0, half).reverse(), target, ...newer.slice(0, half)];
  return { messages: await finish(conversationId, viewer, rows), hasOlder: older.length > half, hasNewer: newer.length > half };
}

export const SINCE_LIMIT = 200;

// Messages created at or after `since` (oldest → newest), for catching up after
// a reconnect. Callers dedupe by id.
export async function getMessagesSince(conversationId: string, viewer: Viewer, since: Date) {
  const rows = await db.message.findMany({
    where: { AND: [{ conversationId, createdAt: { gte: since } }, visibleMessageWhere(viewer)] },
    orderBy: OLDEST_FIRST,
    take: SINCE_LIMIT + 1,
    select: messageSelect,
  });
  return {
    messages: await finish(conversationId, viewer, rows.slice(0, SINCE_LIMIT)),
    hasMore: rows.length > SINCE_LIMIT,
  };
}

// Of the message ids a client is showing, those it may no longer see
// (deleted or hidden while it was offline).
export async function getGoneIds(conversationId: string, viewer: Viewer, ids: string[]) {
  if (ids.length === 0) return [];
  const visible = await db.message.findMany({
    where: { AND: [{ conversationId, id: { in: ids } }, visibleMessageWhere(viewer)] },
    select: { id: true },
  });
  const keep = new Set(visible.map((row) => row.id));
  return ids.filter((id) => !keep.has(id));
}

// The first message I hadn't read (visible, not mine, not a system message,
// created after `lastReadAt`; null = never read anything): for the jump button.
export async function getFirstUnreadId(conversationId: string, viewer: Viewer, lastReadAt: Date | null) {
  const row = await db.message.findFirst({
    where: {
      AND: [
        { conversationId, senderId: { not: viewer.userId }, type: { not: "SYSTEM" } },
        visibleMessageWhere(viewer),
        ...(lastReadAt ? [{ createdAt: { gt: lastReadAt } }] : []),
      ],
    },
    orderBy: OLDEST_FIRST,
    select: { id: true },
  });
  return row?.id ?? null;
}

export type { ChatMessage };

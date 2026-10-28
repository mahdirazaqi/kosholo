import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { attachViews } from "@/lib/chat/views";
import { visibleMessageWhere, type Viewer } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { MessagesPage } from "@/lib/types/chat";

export const PAGE_SIZE = 40;

// The cursor is the oldest loaded message's position ("createdAt|id"), not a
// row reference, so paging keeps working after that message is deleted.
function encodeCursor(row: { createdAt: Date; id: string }) {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

function olderThan(cursor: string): Prisma.MessageWhereInput | null {
  const [iso, id] = cursor.split("|");
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

// `viewer` comes from getViewer(), which is also the membership check.
// Fetches newest first from the DB and returns the page oldest → newest.
export async function getMessages(conversationId: string, viewer: Viewer, cursor?: string): Promise<MessagesPage> {
  const before = cursor ? olderThan(cursor) : null;
  if (cursor && !before) return { messages: [], nextCursor: null };

  const rows = await db.message.findMany({
    where: { AND: [{ conversationId }, visibleMessageWhere(viewer), ...(before ? [before] : [])] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: messageSelect,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const oldest = page.at(-1);
  const messages = page.map((row) => toChatMessage(row, viewer)).reverse();
  return {
    messages: viewer.conversationType === "CHANNEL" ? await attachViews(conversationId, messages) : messages,
    nextCursor: hasMore && oldest ? encodeCursor(oldest) : null,
  };
}

export const SINCE_LIMIT = 200;

// Messages created at or after `since` (oldest → newest), for catching up after
// a reconnect. Callers dedupe by id.
export async function getMessagesSince(conversationId: string, viewer: Viewer, since: Date) {
  const rows = await db.message.findMany({
    where: { AND: [{ conversationId, createdAt: { gte: since } }, visibleMessageWhere(viewer)] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: SINCE_LIMIT + 1,
    select: messageSelect,
  });
  const messages = rows.slice(0, SINCE_LIMIT).map((row) => toChatMessage(row, viewer));
  return {
    messages: viewer.conversationType === "CHANNEL" ? await attachViews(conversationId, messages) : messages,
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

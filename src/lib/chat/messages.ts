import "server-only";

import { messageSelect, toChatMessage } from "@/lib/chat/queries";
import { db } from "@/lib/db";
import type { MessagesPage } from "@/lib/types/chat";

export const PAGE_SIZE = 40;

// Callers must check membership first (isMember / getConversationForMember).
// Fetches newest first from the DB and returns the page oldest → newest.
// `cursor` is the id of the oldest message already loaded.
export async function getMessages(conversationId: string, cursor?: string): Promise<MessagesPage> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const oldest = page.at(-1);
  return {
    messages: page.map(toChatMessage).reverse(),
    nextCursor: hasMore && oldest ? oldest.id : null,
  };
}

export const SINCE_LIMIT = 200;

// Messages created at or after `since` (oldest → newest), for catching up after
// a reconnect. Callers must check membership and dedupe by id.
export async function getMessagesSince(conversationId: string, since: Date) {
  const rows = await db.message.findMany({
    where: { conversationId, createdAt: { gte: since } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: SINCE_LIMIT + 1,
    select: messageSelect,
  });
  return {
    messages: rows.slice(0, SINCE_LIMIT).map(toChatMessage),
    hasMore: rows.length > SINCE_LIMIT,
  };
}

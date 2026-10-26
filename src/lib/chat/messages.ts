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

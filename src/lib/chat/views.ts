import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ChatMessage } from "@/lib/types/chat";

// Channel post views, with no table of their own: the number of current
// members whose lastReadAt is at or after the post (the author counts, since
// sending sets their lastReadAt). One aggregated query per page of posts.
export async function getViewCounts(conversationId: string, messageIds: string[]): Promise<Record<string, number>> {
  if (messageIds.length === 0) return {};
  const rows = await db.$queryRaw<{ id: string; views: number }[]>(Prisma.sql`
    SELECT m.id, COUNT(cm.user_id)::int AS views
    FROM messages m
    JOIN conversation_members cm
      ON cm.conversation_id = m.conversation_id AND cm.last_read_at >= m.created_at
    WHERE m.conversation_id = ${conversationId}::uuid
      AND m.id = ANY(${messageIds}::uuid[])
      AND m.type <> 'SYSTEM'
    GROUP BY m.id
  `);
  return Object.fromEntries(rows.map((row) => [row.id, row.views]));
}

// Adds `views` to the channel posts of one conversation (others untouched).
export async function attachViews(conversationId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const ids = messages.filter((m) => m.type !== "SYSTEM").map((m) => m.id);
  const counts = await getViewCounts(conversationId, ids);
  return messages.map((m) => (m.type === "SYSTEM" ? m : { ...m, views: counts[m.id] ?? 0 }));
}

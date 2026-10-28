import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { visibleSql } from "@/lib/chat/visibility";
import { db } from "@/lib/db";
import type { UnreadSummary } from "@/lib/types/chat";

// THE unread rule, and the only place that counts. A message counts for user U
// when it is visible to U (the visibility rule: U is a current member, hasn't
// hidden it, hasn't cleared past it), was created after U's lastReadAt, wasn't
// sent by U and isn't a system message. Muted conversations keep their own
// count but stay out of `total`. Conversations U left, was removed from, or
// that were deleted have no membership row, so they simply don't appear (0).
//
// One aggregated query for all conversations (or one, via `onlyId`).
export async function getUnreadSummary(userId: string, onlyId?: string): Promise<UnreadSummary> {
  const rows = await db.$queryRaw<{ conversation_id: string; muted: boolean; count: number }[]>(Prisma.sql`
    SELECT cm.conversation_id, cm.muted, COUNT(m.id)::int AS count
    FROM conversation_members cm
    LEFT JOIN messages m
      ON m.conversation_id = cm.conversation_id
      AND m.sender_id <> cm.user_id
      AND m.type <> 'SYSTEM'
      AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      AND ${visibleSql("m", "cm")}
    WHERE cm.user_id = ${userId}::uuid
      ${onlyId ? Prisma.sql`AND cm.conversation_id = ${onlyId}::uuid` : Prisma.empty}
    GROUP BY cm.conversation_id, cm.muted
  `);

  const perConversation: UnreadSummary["perConversation"] = {};
  let total = 0;
  for (const row of rows) {
    perConversation[row.conversation_id] = { count: row.count, muted: row.muted };
    if (!row.muted) total += row.count;
  }
  return { total, perConversation };
}

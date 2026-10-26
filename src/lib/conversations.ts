import "server-only";

import { db } from "@/lib/db";
import { publicUserSelect } from "@/lib/users";
import { userIdSchema } from "@/lib/validations/contacts";

// Key that identifies the single DIRECT conversation between two users.
export function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

// Returns the conversation only if `userId` is a member; null otherwise
// (including malformed ids), so callers can respond with a 404.
export async function getConversationForMember(conversationId: string, userId: string) {
  if (!userIdSchema.safeParse(conversationId).success) return null;

  return db.conversation.findFirst({
    where: { id: conversationId, members: { some: { userId } } },
    select: {
      id: true,
      type: true,
      title: true,
      avatarUrl: true,
      members: { select: { role: true, user: { select: publicUserSelect } } },
    },
  });
}

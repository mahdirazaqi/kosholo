// Conversation membership cache, shared by the socket server and Server
// Actions (stored on globalThis: they load separate module copies).
// Must not import "server-only": the custom server runs outside React Server.
import { db } from "@/lib/db";

const TTL_MS = 60_000;

type Entry = { memberIds: string[]; expiresAt: number };

const globalForMembership = globalThis as unknown as { __membership?: Map<string, Entry> };
const cache = (globalForMembership.__membership ??= new Map());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export async function getMemberIds(conversationId: string): Promise<string[]> {
  if (!isUuid(conversationId)) return [];
  const now = Date.now();
  const hit = cache.get(conversationId);
  if (hit && hit.expiresAt > now) return hit.memberIds;

  const rows = await db.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const memberIds = rows.map((row) => row.userId);
  if (cache.size > 5000) {
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  }
  cache.set(conversationId, { memberIds, expiresAt: now + TTL_MS });
  return memberIds;
}

export async function isConversationMember(conversationId: string, userId: string) {
  return (await getMemberIds(conversationId)).includes(userId);
}

// Call after adding/removing members (groups, phase 5).
export function invalidateMembership(conversationId: string) {
  cache.delete(conversationId);
}

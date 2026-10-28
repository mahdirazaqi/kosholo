// Conversation membership cache, shared by the socket server and Server
// Actions (stored on globalThis: they load separate module copies).
// Must not import "server-only": the custom server runs outside React Server.
import { db } from "@/lib/db";

const TTL_MS = 60_000;

type Entry = { type: string; memberIds: string[]; adminIds: Set<string>; expiresAt: number };

const globalForMembership = globalThis as unknown as { __membership?: Map<string, Entry> };
const cache = (globalForMembership.__membership ??= new Map());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type Membership = { type: string; memberIds: string[]; adminIds: Set<string> };

// Members, roles and the conversation type, cached for 60s. Channels never
// reveal who is in them, so socket handlers need the roles to decide who may
// type and who may be told about whom.
export async function getMembership(conversationId: string): Promise<Membership> {
  if (!isUuid(conversationId)) return { type: "", memberIds: [], adminIds: new Set() };
  const now = Date.now();
  const hit = cache.get(conversationId);
  if (hit && hit.expiresAt > now) return hit;

  const [rows, conversation] = await Promise.all([
    db.conversationMember.findMany({ where: { conversationId }, select: { userId: true, role: true } }),
    db.conversation.findUnique({ where: { id: conversationId }, select: { type: true } }),
  ]);
  const entry: Entry = {
    type: conversation?.type ?? "",
    memberIds: rows.map((row) => row.userId),
    adminIds: new Set(rows.filter((row) => row.role === "ADMIN").map((row) => row.userId)),
    expiresAt: now + TTL_MS,
  };
  if (cache.size > 5000) {
    for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
  }
  cache.set(conversationId, entry);
  return entry;
}

export async function getMemberIds(conversationId: string): Promise<string[]> {
  return (await getMembership(conversationId)).memberIds;
}

export async function isConversationMember(conversationId: string, userId: string) {
  return (await getMemberIds(conversationId)).includes(userId);
}

// Call after adding/removing members or changing roles.
export function invalidateMembership(conversationId: string) {
  cache.delete(conversationId);
}

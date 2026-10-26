import { db } from "@/lib/db";
import { isUuid } from "@/lib/realtime/membership";
import { PRESENCE_GRACE_MS, presenceRoom, type PresenceState } from "@/lib/realtime/events";
import type { AppServer } from "@/server/io";

// userId → number of connected sockets (tabs/devices). Single process, so in memory.
const socketCounts = new Map<string, number>();
// Users whose last socket closed recently; they stay "online" until this fires.
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

const MAX_SUBSCRIBE = 100;

export function isOnline(userId: string) {
  return socketCounts.has(userId) || offlineTimers.has(userId);
}

export function userConnected(io: AppServer, userId: string) {
  const pending = offlineTimers.get(userId);
  if (pending) {
    // Reconnected within the grace period: observers never saw them go offline.
    clearTimeout(pending);
    offlineTimers.delete(userId);
  }
  const count = (socketCounts.get(userId) ?? 0) + 1;
  socketCounts.set(userId, count);
  if (count === 1 && !pending) {
    io.to(presenceRoom(userId)).emit("presence:update", { userId, online: true, lastSeenAt: null });
  }
}

export function userDisconnected(io: AppServer, userId: string) {
  const count = (socketCounts.get(userId) ?? 1) - 1;
  if (count > 0) {
    socketCounts.set(userId, count);
    return;
  }
  socketCounts.delete(userId);
  offlineTimers.set(
    userId,
    setTimeout(async () => {
      offlineTimers.delete(userId);
      if (socketCounts.has(userId)) return;
      const lastSeenAt = new Date();
      try {
        await db.user.update({ where: { id: userId }, data: { lastSeenAt } });
      } catch (error) {
        console.error("[presence] lastSeenAt update failed", error);
      }
      io.to(presenceRoom(userId)).emit("presence:update", {
        userId,
        online: false,
        lastSeenAt: lastSeenAt.toISOString(),
      });
    }, PRESENCE_GRACE_MS),
  );
}

// Only users who share a conversation with me, or are in my contacts, can be
// watched; anything else is silently dropped.
export async function getWatchablePresence(viewerId: string, userIds: unknown): Promise<PresenceState[]> {
  if (!Array.isArray(userIds)) return [];
  const ids = [...new Set(userIds.filter(isUuid))].slice(0, MAX_SUBSCRIBE);
  if (ids.length === 0) return [];

  const users = await db.user.findMany({
    where: {
      id: { in: ids },
      OR: [
        { memberships: { some: { conversation: { members: { some: { userId: viewerId } } } } } },
        { contactOf: { some: { ownerId: viewerId } } },
      ],
    },
    select: { id: true, lastSeenAt: true },
  });

  return users.map((user) => ({
    userId: user.id,
    online: isOnline(user.id),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  }));
}

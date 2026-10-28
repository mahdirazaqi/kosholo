"use client";

import { useNow } from "@/hooks/use-now";
import { formatLastSeen } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
import { useRealtimeStore } from "@/lib/realtime/client/store";

// "online" or "last seen …" for one user (subscribe separately).
export function PresenceText({ userId }: { userId: string }) {
  const presence = useRealtimeStore((state) => state.presence[userId]);
  const now = useNow(60_000);
  const timeZone = useTimeZone();
  if (presence?.online) return <span className="text-emerald-600 dark:text-emerald-400">online</span>;
  if (presence?.lastSeenAt) return <>last seen {formatLastSeen(presence.lastSeenAt, timeZone, now)}</>;
  if (presence) return <>offline</>;
  return null;
}

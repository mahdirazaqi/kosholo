"use client";

import { useNow } from "@/hooks/use-now";
import { formatLastSeen } from "@/lib/format-date";
import { useRealtimeStore } from "@/lib/realtime/client/store";

// «آنلاین» or «آخرین بازدید …» for one user (subscribe separately).
export function PresenceText({ userId }: { userId: string }) {
  const presence = useRealtimeStore((state) => state.presence[userId]);
  const now = useNow(60_000);
  if (presence?.online) return <span className="text-emerald-600 dark:text-emerald-400">آنلاین</span>;
  if (presence?.lastSeenAt) return <>آخرین بازدید {formatLastSeen(presence.lastSeenAt, now)}</>;
  if (presence) return <>آفلاین</>;
  return null;
}

"use client";

import { useEffect } from "react";
import { subscribePresence, useRealtimeStore } from "@/lib/realtime/client/store";

// Watches one user's online status while mounted.
export function usePresence(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    return subscribePresence([userId]);
  }, [userId]);
  return useRealtimeStore((state) => (userId ? state.presence[userId] : undefined));
}

"use client";

import { useEffect } from "react";
import { useRealtimeStore } from "@/lib/realtime/client/store";

// Puts the signed-in user's id in the realtime store before the socket's
// session:ready arrives (the sidebar needs it for "You" in previews).
export function CurrentUserBootstrap({ userId }: { userId: string }) {
  useEffect(() => {
    if (useRealtimeStore.getState().me !== userId) useRealtimeStore.setState({ me: userId });
  }, [userId]);
  return null;
}

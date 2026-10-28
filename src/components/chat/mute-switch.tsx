"use client";

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { setMuted } from "@/app/(app)/chats/actions";
import { Switch } from "@/components/ui/switch";
import { getSocket } from "@/lib/realtime/client/socket";
import { patchConversation } from "@/lib/realtime/client/store";
import type { ConversationUpdatedPayload } from "@/lib/realtime/events";

// "Mute" row for the info pages (every conversation type). Muted conversations
// make no sound and aren't counted in the unread badges; other tabs follow
// through conversation:updated.
export function MuteSwitch({ conversationId, initialMuted }: { conversationId: string; initialMuted: boolean }) {
  const [muted, setMutedState] = useState(initialMuted);

  useEffect(() => {
    const socket = getSocket();
    const onUpdated = (payload: ConversationUpdatedPayload) => {
      if (payload.conversationId === conversationId && payload.muted !== undefined) setMutedState(payload.muted);
    };
    socket.on("conversation:updated", onUpdated);
    return () => void socket.off("conversation:updated", onUpdated);
  }, [conversationId]);

  function change(next: boolean) {
    setMutedState(next);
    patchConversation(conversationId, { muted: next });
    void setMuted(conversationId, next)
      .then((result) => {
        if (!result.ok) throw new Error();
      })
      .catch(() => {
        setMutedState(!next);
        patchConversation(conversationId, { muted: !next });
        toast.error("Couldn't change the notification setting");
      });
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 py-3.5">
      <BellOff className="size-5 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Mute</span>
        <span className="block text-sm text-muted-foreground">No sound, and not counted in the unread badge</span>
      </span>
      <Switch checked={muted} onCheckedChange={change} aria-label="Mute" />
    </label>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { TypingIndicator } from "@/components/chat/typing-dots";
import { useNow } from "@/hooks/use-now";
import { usePresence } from "@/hooks/use-presence";
import { formatLastSeen } from "@/lib/format-date";
import { useRealtimeStore } from "@/lib/realtime/client/store";
import type { ChatConversation } from "@/lib/types/chat";

// Chat header subtitle, by priority: connecting → typing → presence.
export function ChatStatus({ conversation }: { conversation: ChatConversation }) {
  const connected = useRealtimeStore((state) => state.connected);
  const typingNames = useRealtimeStore((state) => state.typing[conversation.id]);
  const presence = usePresence(conversation.otherUser?.id);
  const now = useNow(60_000);

  let content: React.ReactNode;
  if (!connected) {
    content = (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" />
        در حال اتصال...
      </span>
    );
  } else if (typingNames && Object.keys(typingNames).length > 0) {
    content = <TypingIndicator />;
  } else if (presence?.online) {
    content = <span className="text-emerald-600 dark:text-emerald-400">آنلاین</span>;
  } else if (presence?.lastSeenAt) {
    content = `آخرین بازدید ${formatLastSeen(presence.lastSeenAt, now)}`;
  } else if (presence) {
    content = "آفلاین";
  } else if (conversation.otherUser) {
    content = <bdi dir="ltr">@{conversation.otherUser.username}</bdi>;
  } else {
    content = `${conversation.memberCount.toLocaleString("fa-IR")} عضو`;
  }

  return (
    <span aria-live="polite" className="block truncate text-xs font-normal text-muted-foreground">
      {content}
    </span>
  );
}

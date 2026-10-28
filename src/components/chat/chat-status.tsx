"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { TypingIndicator, typingLabel } from "@/components/chat/typing-dots";
import { useNow } from "@/hooks/use-now";
import { usePresence } from "@/hooks/use-presence";
import { formatLastSeen } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
import { subscribePresence, useRealtimeStore } from "@/lib/realtime/client/store";
import type { ChatConversation } from "@/lib/types/chat";
import { formatCount, formatNumber } from "@/lib/numbers";

// Chat header subtitle, by priority: connecting → typing → presence.
export function ChatStatus({
  conversation,
  currentUserId,
}: {
  conversation: ChatConversation;
  currentUserId: string;
}) {
  const connected = useRealtimeStore((state) => state.connected);
  const typing = useRealtimeStore((state) => state.typing[conversation.id]);
  const isGroup = conversation.type === "GROUP" || conversation.type === "CHANNEL";

  // Saved Messages has no subtitle: no presence, no typing.
  if (conversation.type === "SAVED") return null;

  let content: React.ReactNode;
  if (!connected) {
    content = (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" />
        Connecting…
      </span>
    );
  } else if (typing && Object.keys(typing).length > 0) {
    content = <TypingIndicator label={typingLabel(Object.values(typing), isGroup)} />;
  } else if (conversation.type === "CHANNEL") {
    // Subscribers never see presence; the count is all there is.
    content = <>{formatCount(conversation.memberCount, "subscriber")}</>;
  } else if (isGroup) {
    content = <GroupPresence conversation={conversation} currentUserId={currentUserId} />;
  } else {
    content = <DirectPresence conversation={conversation} />;
  }

  return (
    <span aria-live="polite" className="block truncate text-xs font-normal text-muted-foreground">
      {content}
    </span>
  );
}

function DirectPresence({ conversation }: { conversation: ChatConversation }) {
  const presence = usePresence(conversation.otherUser?.id);
  const now = useNow(60_000);
  const timeZone = useTimeZone();
  if (presence?.online) return <span className="text-emerald-600 dark:text-emerald-400">online</span>;
  if (presence?.lastSeenAt) return <>last seen {formatLastSeen(presence.lastSeenAt, timeZone, now)}</>;
  if (presence) return <>offline</>;
  if (conversation.otherUser) return <bdi dir="ltr">@{conversation.otherUser.username}</bdi>;
  return null;
}

// "5 members, 2 online" (others online), or "5 members".
function GroupPresence({
  conversation,
  currentUserId,
}: {
  conversation: ChatConversation;
  currentUserId: string;
}) {
  const otherIds = useMemo(
    () => conversation.members.map((m) => m.id).filter((id) => id !== currentUserId),
    [conversation.members, currentUserId],
  );
  const key = otherIds.join(",");
  useEffect(() => subscribePresence(key ? key.split(",") : []), [key]);
  const online = useRealtimeStore(
    (state) => otherIds.filter((id) => state.presence[id]?.online).length,
  );
  const count = formatCount(conversation.memberCount, "member");
  return online > 0 ? <>{count}, {formatNumber(online)} online</> : <>{count}</>;
}

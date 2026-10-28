"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { UnreadPill } from "@/components/unread-pill";
import { Button } from "@/components/ui/button";
import { selectOtherUnread, useRealtimeStore } from "@/lib/realtime/client/store";

// Goes back in history when there is somewhere to go back to, otherwise to `fallback`.
// `unreadExcept`: on a chat page, shows (mobile only, like Telegram) the total
// unread count of the OTHER conversations next to the arrow.
export function BackButton({ fallback = "/", unreadExcept }: { fallback?: string; unreadExcept?: string }) {
  const router = useRouter();
  const others = useRealtimeStore(selectOtherUnread(unreadExcept ?? null));

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Back"
      className="relative -ms-2 rounded-full"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >
      <ChevronLeft className="size-6 rtl:rotate-180" />
      {unreadExcept && (
        <UnreadPill count={others} className="absolute -top-0.5 start-6 h-4.5 min-w-4.5 px-1 text-[10px] ring-2 ring-background lg:hidden" />
      )}
    </Button>
  );
}

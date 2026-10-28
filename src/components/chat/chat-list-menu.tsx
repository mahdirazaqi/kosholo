"use client";

import { useState, useTransition } from "react";
import { CheckCheck, EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import { markAllAsRead } from "@/app/(app)/chats/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { refreshUnreadSummary, selectTotalUnread, useRealtimeStore } from "@/lib/realtime/client/store";

// Above this many unread messages, "Read all" asks first.
const CONFIRM_ABOVE = 50;

// Header menu of the chat list: "Read all" marks every non-muted conversation
// as read with one server action. The unread store is replaced by the server's
// summary afterwards (server wins).
export function ChatListMenu() {
  const total = useRealtimeStore(selectTotalUnread);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function readAll() {
    startTransition(async () => {
      try {
        await markAllAsRead();
        refreshUnreadSummary();
        setConfirmOpen(false);
      } catch {
        toast.error("Couldn't mark the chats as read");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" aria-label="Chat list options" className="-me-2 size-11 rounded-full">
            <EllipsisVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem disabled={total === 0 || pending} onSelect={() => (total > CONFIRM_ABOVE ? setConfirmOpen(true) : readAll())}>
            <CheckCheck />
            Read all
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Mark all as read?"
        description="Every chat that isn't muted will be marked as read."
        confirmLabel="Read all"
        pending={pending}
        onConfirm={readAll}
      />
    </>
  );
}

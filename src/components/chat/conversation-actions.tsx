"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearHistory, deleteConversation } from "@/app/(app)/chats/delete-actions";
import { deleteGroup, leaveAndDeleteGroup } from "@/app/(app)/chats/group-actions";
import { DeleteDialog } from "@/components/chat/delete-dialog";
import { Button } from "@/components/ui/button";
import { canClearForEveryone } from "@/lib/chat/permissions";
import {
  markLocalDelete,
  refreshConversationRow,
  removeConversation,
} from "@/lib/realtime/client/store";
import type { ConversationType, MemberRole } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

// Conversation-level deletion, shared by the chat header menu, chat-list rows
// and the info pages: the list of actions, their confirm dialogs and the calls.

export type ConversationActionTarget = {
  id: string;
  type: ConversationType;
  title: string; // the other person's name for DIRECT
  myRole: MemberRole;
};

export type ConversationAction = "clear" | "delete" | "leave" | "deleteGroup";

export type ConversationActionItem = {
  kind: ConversationAction;
  label: string;
  icon: React.ReactNode;
  destructive: boolean;
};

// `withDeleteGroup`: the admin's "Delete group for everyone" (header and info
// page, not chat-list rows).
export function conversationActionItems(
  target: ConversationActionTarget,
  { withDeleteGroup = false } = {},
): ConversationActionItem[] {
  const items: ConversationActionItem[] = [
    { kind: "clear", label: "Clear history", icon: <Eraser />, destructive: false },
  ];
  if (target.type === "DIRECT") {
    items.push({ kind: "delete", label: "Delete chat", icon: <Trash2 />, destructive: true });
  } else {
    items.push({ kind: "leave", label: "Leave and delete group", icon: <LogOut className="rtl:rotate-180" />, destructive: true });
    if (withDeleteGroup && target.myRole === "ADMIN") {
      items.push({ kind: "deleteGroup", label: "Delete group for everyone", icon: <Trash2 />, destructive: true });
    }
  }
  return items;
}

const inChat = (conversationId: string) =>
  typeof window !== "undefined" && window.location.pathname.startsWith(`/chats/${conversationId}`);

// Returns `open(kind)` to start an action (it opens the confirm dialog) and the
// dialog element to render.
export function useConversationActions(target: ConversationActionTarget) {
  const router = useRouter();
  const [action, setAction] = useState<ConversationAction | null>(null);
  const [pending, startTransition] = useTransition();

  function leaveChat() {
    removeConversation(target.id);
    if (inChat(target.id)) router.replace("/");
  }

  function run(forEveryone: boolean) {
    const kind = action;
    if (!kind) return;
    markLocalDelete(target.id);
    startTransition(async () => {
      const result =
        kind === "clear"
          ? await clearHistory({ conversationId: target.id, forEveryone })
          : kind === "delete"
            ? await deleteConversation({ conversationId: target.id, forEveryone })
            : kind === "leave"
              ? await leaveAndDeleteGroup(target.id)
              : await deleteGroup(target.id);
      if (!result.ok) return void toast.error(result.error);
      setAction(null);

      if (kind === "clear") {
        toast.success("History cleared");
        // Clearing for me can delete a DIRECT chat outright (both cleared).
        if ("conversationDeleted" in result && result.conversationDeleted) leaveChat();
        else refreshConversationRow(target.id);
        return;
      }
      toast.success(kind === "leave" ? "You left the group" : kind === "deleteGroup" ? "Group deleted" : "Chat deleted");
      leaveChat();
    });
  }

  const dialog = action && (
    <DeleteDialog
      open
      onOpenChange={(open) => !open && !pending && setAction(null)}
      pending={pending}
      onConfirm={run}
      {...copyFor(action, target)}
    />
  );

  return { open: setAction, dialog };
}

function copyFor(action: ConversationAction, target: ConversationActionTarget) {
  const direct = target.type === "DIRECT";
  switch (action) {
    case "clear":
      return {
        title: "Clear history?",
        description: "All messages in this chat will be deleted for you.",
        everyoneLabel: canClearForEveryone({ role: target.myRole, conversationType: target.type })
          ? direct
            ? `Also clear for ${target.title}`
            : "Clear for everyone"
          : null,
        confirmLabel: "Clear history",
      };
    case "delete":
      return {
        title: "Delete chat?",
        description: "This chat and its messages will be deleted for you.",
        everyoneLabel: `Also delete for ${target.title}`,
        confirmLabel: "Delete",
      };
    case "leave":
      return {
        title: "Leave and delete group?",
        description: `You'll leave “${target.title}” and it will be removed from your chats.`,
        everyoneLabel: null,
        confirmLabel: "Leave and delete",
      };
    case "deleteGroup":
      return {
        title: "Delete group for everyone?",
        description: `“${target.title}” and all its messages will be permanently deleted for every member.`,
        everyoneLabel: null,
        confirmLabel: "Delete for everyone",
      };
  }
}

// Info pages: the same actions as red buttons at the bottom.
export function ConversationDangerZone({ target }: { target: ConversationActionTarget }) {
  const { open, dialog } = useConversationActions(target);
  return (
    <section className="grid gap-2">
      {conversationActionItems(target, { withDeleteGroup: true }).map((item) => (
        <Button
          key={item.kind}
          variant={item.kind === "deleteGroup" ? "destructive" : "outline"}
          size="lg"
          onClick={() => open(item.kind)}
          className={cn(
            "h-12 w-full rounded-xl text-base",
            item.kind !== "deleteGroup" && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          {item.icon}
          {item.label}
        </Button>
      ))}
      {dialog}
    </section>
  );
}

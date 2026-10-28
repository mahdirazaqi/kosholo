"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, Eraser, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { markAsRead, setMuted } from "@/app/(app)/chats/actions";
import { deleteChannel, leaveChannel } from "@/app/(app)/chats/channel-actions";
import { clearHistory, deleteConversation } from "@/app/(app)/chats/delete-actions";
import { deleteGroup, leaveAndDeleteGroup } from "@/app/(app)/chats/group-actions";
import { DeleteDialog } from "@/components/chat/delete-dialog";
import { Button } from "@/components/ui/button";
import { canClearForEveryone } from "@/lib/chat/permissions";
import {
  markLocalDelete,
  refreshConversationRow,
  markConversationRead,
  patchConversation,
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
  muted: boolean;
  unread?: number; // from the unread store: "Mark as read" is offered above 0
  isOwner?: boolean; // CHANNEL: the owner can delete it for everyone
};

export type ConversationAction = "markRead" | "mute" | "clear" | "delete" | "leave" | "deleteGroup";

export type ConversationActionItem = {
  kind: ConversationAction;
  label: string;
  icon: React.ReactNode;
  destructive: boolean;
};

// `withDeleteGroup`: the admin's "Delete group for everyone" / the channel
// owner's "Delete channel" (header and info page, not chat-list rows).
export function conversationActionItems(
  target: ConversationActionTarget,
  { withDeleteGroup = false } = {},
): ConversationActionItem[] {
  // Saved Messages: just clear and delete (no mute, no info actions).
  if (target.type === "SAVED") {
    return [
      { kind: "clear", label: "Clear history", icon: <Eraser />, destructive: false },
      { kind: "delete", label: "Delete chat", icon: <Trash2 />, destructive: true },
    ];
  }
  const items: ConversationActionItem[] = [
    ...((target.unread ?? 0) > 0
      ? [{ kind: "markRead" as const, label: "Mark as read", icon: <CheckCheck />, destructive: false }]
      : []),
    target.muted
      ? { kind: "mute", label: "Unmute", icon: <Bell />, destructive: false }
      : { kind: "mute", label: "Mute", icon: <BellOff />, destructive: false },
    { kind: "clear", label: "Clear history", icon: <Eraser />, destructive: false },
  ];
  if (target.type === "DIRECT") {
    items.push({ kind: "delete", label: "Delete chat", icon: <Trash2 />, destructive: true });
  } else if (target.type === "CHANNEL") {
    items.push({ kind: "leave", label: "Leave channel", icon: <LogOut className="rtl:rotate-180" />, destructive: true });
    if (withDeleteGroup && target.isOwner) {
      items.push({ kind: "deleteGroup", label: "Delete channel", icon: <Trash2 />, destructive: true });
    }
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
export function useConversationActions(
  target: ConversationActionTarget,
  { onMuted }: { onMuted?: (muted: boolean) => void } = {},
) {
  const router = useRouter();
  const [action, setAction] = useState<ConversationAction | null>(null);
  const [pending, startTransition] = useTransition();

  function leaveChat() {
    removeConversation(target.id);
    if (inChat(target.id)) router.replace("/");
  }

  // Without opening the chat: clear the badge now, tell the server.
  function markRead() {
    markConversationRead(target.id);
    void markAsRead(target.id).catch(() => refreshConversationRow(target.id));
  }

  // Mute needs no confirmation: optimistic, undone if the server says no.
  function toggleMute() {
    const muted = !target.muted;
    patchConversation(target.id, { muted });
    onMuted?.(muted);
    void setMuted(target.id, muted)
      .then((result) => {
        if (!result.ok) throw new Error();
        toast.success(muted ? "Muted" : "Unmuted");
      })
      .catch(() => {
        patchConversation(target.id, { muted: !muted });
        onMuted?.(!muted);
        toast.error("Couldn't change the notification setting");
      });
  }

  function run(requestedForEveryone: boolean) {
    const kind = action;
    if (!kind) return;
    // Saved Messages has one member: deleting it is always a hard delete.
    const forEveryone = kind === "delete" && target.type === "SAVED" ? true : requestedForEveryone;
    markLocalDelete(target.id);
    startTransition(async () => {
      const result =
        kind === "clear"
          ? await clearHistory({ conversationId: target.id, forEveryone })
          : kind === "delete"
            ? await deleteConversation({ conversationId: target.id, forEveryone })
            : kind === "leave"
              ? target.type === "CHANNEL"
                ? await leaveChannel(target.id)
                : await leaveAndDeleteGroup(target.id)
              : target.type === "CHANNEL"
                ? await deleteChannel(target.id)
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
      const noun = target.type === "CHANNEL" ? "channel" : "group";
      toast.success(kind === "leave" ? `You left the ${noun}` : kind === "deleteGroup" ? `${noun[0].toUpperCase()}${noun.slice(1)} deleted` : "Chat deleted");
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

  // "mute" runs at once; the rest open their confirm dialog.
  const open = (kind: ConversationAction) =>
    kind === "mute" ? toggleMute() : kind === "markRead" ? markRead() : setAction(kind);
  return { open, dialog };
}

function copyFor(action: ConversationAction, target: ConversationActionTarget) {
  const direct = target.type === "DIRECT";
  switch (action) {
    case "mute":
    case "markRead":
      throw new Error(`${action} has no dialog`);
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
        description:
          target.type === "SAVED"
            ? "All your saved messages will be deleted. Saved Messages is created again, empty, when you next open it."
            : "This chat and its messages will be deleted for you.",
        everyoneLabel: target.type === "SAVED" ? null : `Also delete for ${target.title}`,
        confirmLabel: "Delete",
      };
    case "leave":
      if (target.type === "CHANNEL") {
        return {
          title: "Leave channel?",
          description: `You'll leave “${target.title}” and it will be removed from your chats.`,
          everyoneLabel: null,
          confirmLabel: "Leave channel",
        };
      }
      return {
        title: "Leave and delete group?",
        description: `You'll leave “${target.title}” and it will be removed from your chats.`,
        everyoneLabel: null,
        confirmLabel: "Leave and delete",
      };
    case "deleteGroup":
      if (target.type === "CHANNEL") {
        return {
          title: "Delete channel?",
          description: `“${target.title}”, all its posts and files will be permanently deleted for every subscriber. This can't be undone.`,
          everyoneLabel: null,
          confirmLabel: "Delete channel",
        };
      }
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
      {conversationActionItems(target, { withDeleteGroup: true })
        .filter((item) => item.kind !== "mute" && item.kind !== "markRead") // the info pages have their own switch
        .map((item) => (
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

"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EllipsisVertical, Loader2, MessageCirclePlus, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { listMyContacts } from "@/app/(app)/(tabs)/contacts/actions";
import {
  conversationActionItems,
  useConversationActions,
  type ConversationAction,
} from "@/components/chat/conversation-actions";
import { NewChatSheet } from "@/components/chat/new-chat-sheet";
import { NewConversationSheet } from "@/components/chat/new-conversation-sheet";
import { previewText } from "@/components/chat/message-preview";
import { TypingIndicator, typingLabel } from "@/components/chat/typing-dots";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { vibrate } from "@/lib/client-utils";
import { firstName, systemMessageText } from "@/lib/chat/system-text";
import { formatCount, formatNumber } from "@/lib/numbers";
import { formatListTime } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
import { hydrateConversations, useRealtimeStore } from "@/lib/realtime/client/store";
import type { ConversationListItem } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { cn } from "@/lib/utils";

// The list on the "Chats" tab (mobile/tablet). On desktop the same list
// lives in the sidebar (DesktopSidebar) and this page shows an empty main pane.
export function ChatListView({
  conversations: serverConversations,
  currentUserId,
}: {
  conversations: ConversationListItem[];
  currentUserId: string;
}) {
  // The realtime store keeps the list live (new messages, unread counts);
  // server data seeds it and refreshes it on every visit.
  useEffect(() => hydrateConversations(serverConversations), [serverConversations]);
  const liveConversations = useRealtimeStore((state) => state.conversations);
  const conversations = liveConversations ?? serverConversations;

  return (
    <ConversationList
      conversations={conversations}
      currentUserId={currentUserId}
      empty={<NewConversationLauncher variant="inline" />}
    />
  );
}

export function ConversationList({
  conversations,
  currentUserId,
  selectedId,
  empty,
}: {
  conversations: ConversationListItem[];
  currentUserId: string | null;
  selectedId?: string | null;
  empty?: React.ReactNode; // action for the empty state
}) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<MessagesSquare />}
        title="No chats yet"
        description="Pick one of your contacts and send the first message."
        action={empty}
      />
    );
  }
  return (
    <ul className="px-2 pt-1 pb-28 lg:pb-4">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <ConversationRow
            conversation={conversation}
            currentUserId={currentUserId}
            selected={conversation.id === selectedId}
          />
        </li>
      ))}
    </ul>
  );
}

// "New chat": choice sheet (chat or group) + contact picker. Contacts come
// from props on the chat list page, or are loaded on demand (sidebar).
export function NewConversationLauncher({
  contacts: initialContacts,
  variant,
}: {
  contacts?: PublicUser[];
  variant: "fab" | "inline" | "sidebar";
}) {
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contacts, setContacts] = useState<PublicUser[] | null>(initialContacts ?? null);
  const [loading, setLoading] = useState(false);

  async function openNewChat() {
    setChoiceOpen(false);
    if (!contacts) {
      setLoading(true);
      try {
        setContacts(await listMyContacts());
      } catch {
        return void toast.error("Couldn't load contacts");
      } finally {
        setLoading(false);
      }
    }
    setNewChatOpen(true);
  }

  const trigger =
    variant === "fab" ? (
      <Button
        size="lg"
        onClick={() => setChoiceOpen(true)}
        className="absolute end-[calc(1rem+max(env(safe-area-inset-left),env(safe-area-inset-right)))] bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 h-14 gap-2 rounded-2xl px-5 text-base shadow-lg shadow-primary/20 lg:bottom-6"
      >
        <MessageCirclePlus className="size-5" />
        New chat
      </Button>
    ) : (
      <Button
        size="lg"
        variant={variant === "sidebar" ? "outline" : "default"}
        onClick={() => setChoiceOpen(true)}
        disabled={loading}
        className={cn("h-11 rounded-xl px-5 text-base", variant === "sidebar" && "w-full")}
      >
        {loading ? <Loader2 className="animate-spin" /> : <MessageCirclePlus />}
        {variant === "sidebar" ? "New chat" : "Start a chat"}
      </Button>
    );

  return (
    <>
      {trigger}
      <NewConversationSheet open={choiceOpen} onOpenChange={setChoiceOpen} onNewChat={() => void openNewChat()} />
      <NewChatSheet open={newChatOpen} onOpenChange={setNewChatOpen} contacts={contacts ?? []} />
    </>
  );
}

// Memoized, and subscribes to its own typing state, so typing in one chat
// doesn't re-render every row.
export const ConversationRow = memo(function ConversationRow({
  conversation,
  currentUserId,
  selected = false,
}: {
  conversation: ConversationListItem;
  currentUserId: string | null;
  selected?: boolean;
}) {
  const typing = useRealtimeStore((state) => state.typing[conversation.id]);
  const timeZone = useTimeZone();
  const typingNames = typing ? Object.values(typing) : null;
  const { lastMessage, unreadCount } = conversation;
  const isGroup = conversation.type === "GROUP";
  // "You: …" for mine; "Jane: …" for others in groups; system events as text.
  const prefix =
    !lastMessage || lastMessage.type === "SYSTEM"
      ? null
      : lastMessage.isMine
        ? "You: "
        : isGroup
          ? `${firstName(lastMessage.senderName)}: `
          : null;
  const previewBody = !lastMessage
    ? null
    : lastMessage.type === "SYSTEM" && lastMessage.meta
      ? systemMessageText(lastMessage.meta, currentUserId)
      : previewText(lastMessage);
  const avatarUser = conversation.otherUser ?? {
    id: conversation.id,
    name: conversation.title,
    avatarUrl: conversation.avatarUrl,
  };

  // Row actions: long-press (touch) → bottom sheet; right-click or the hover
  // button (desktop) → dropdown. Both open the shared confirm dialogs.
  const isDesktop = useIsDesktop();
  const target = { id: conversation.id, type: conversation.type, title: conversation.title, myRole: conversation.myRole };
  const { open: openAction, dialog } = useConversationActions(target);
  const items = conversationActionItems(target);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Chosen in the sheet; opened once it has closed (focus traps).
  const pendingAction = useRef<ConversationAction | null>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; fired: boolean } | null>(null);
  const cancelPress = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    if (press.current) press.current.timer = null;
  };

  return (
    <div className="group/row relative">
      <Link
        href={`/chats/${conversation.id}`}
        aria-current={selected ? "page" : undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          if (isDesktop) setMenuOpen(true);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          press.current = {
            x: event.clientX,
            y: event.clientY,
            fired: false,
            timer: setTimeout(() => {
              if (!press.current) return;
              press.current.fired = true;
              vibrate(10);
              setSheetOpen(true);
            }, LONG_PRESS_MS),
          };
        }}
        onPointerMove={(event) => {
          const current = press.current;
          if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onClick={(event) => {
          // The long-press already opened the sheet: don't also navigate.
          if (press.current?.fired) event.preventDefault();
          press.current = null;
        }}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          selected ? "bg-primary/8 dark:bg-primary/12" : "hover:bg-muted/60 active:bg-muted",
        )}
      >
        <UserAvatar user={avatarUser} size="lg" className="size-13" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{conversation.title}</span>
            {conversation.lastMessageAt && (
              <time
                dateTime={conversation.lastMessageAt}
                suppressHydrationWarning
                className={cn("shrink-0 text-xs", unreadCount > 0 ? "font-medium text-primary" : "text-muted-foreground")}
              >
                {formatListTime(conversation.lastMessageAt, timeZone)}
              </time>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {typingNames ? (
                <TypingIndicator label={typingLabel(typingNames, isGroup)} className="max-w-full font-medium" />
              ) : (
                <>
                  {prefix && <span className="text-foreground/70">{prefix}</span>}
                  {previewBody && <bdi>{previewBody}</bdi>}
                </>
              )}
            </p>
            {unreadCount > 0 && (
              <span
                aria-label={`${formatCount(unreadCount, "unread message")}`}
                className="flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
              >
                {unreadCount > 99 ? "99+" : formatNumber(unreadCount)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {isDesktop && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Options for ${conversation.title}`}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-background opacity-0 shadow-sm transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.kind}
                variant={item.destructive ? "destructive" : "default"}
                onSelect={() => openAction(item.kind)}
              >
                {item.icon}
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheetContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (pendingAction.current) openAction(pendingAction.current);
            pendingAction.current = null;
          }}
        >
          <SheetTitle className="mx-4 truncate text-base font-semibold">{conversation.title}</SheetTitle>
          <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {items.map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => {
                  pendingAction.current = item.kind;
                  setSheetOpen(false);
                }}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors [&_svg]:size-5",
                  item.destructive
                    ? "text-destructive hover:bg-destructive/10 active:bg-destructive/10"
                    : "hover:bg-muted active:bg-muted [&_svg]:text-muted-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </Sheet>
      {dialog}
    </div>
  );
});

const LONG_PRESS_MS = 450;

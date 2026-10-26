"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCirclePlus, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { listMyContacts } from "@/app/(app)/(tabs)/contacts/actions";
import { NewChatSheet } from "@/components/chat/new-chat-sheet";
import { NewConversationSheet } from "@/components/chat/new-conversation-sheet";
import { previewText } from "@/components/chat/message-preview";
import { TypingIndicator, typingLabel } from "@/components/chat/typing-dots";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { firstName, systemMessageText } from "@/lib/chat/system-text";
import { toFaDigits } from "@/lib/digits";
import { formatListTime } from "@/lib/format-date";
import { hydrateConversations, useRealtimeStore } from "@/lib/realtime/client/store";
import type { ConversationListItem } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { cn } from "@/lib/utils";

// The list on the «گفتگوها» tab (mobile/tablet). On desktop the same list
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
        title="هنوز گفتگویی ندارید"
        description="یکی از مخاطبینتان را انتخاب کنید و اولین پیام را بفرستید."
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

// «گفتگوی جدید»: choice sheet (chat or group) + contact picker. Contacts come
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
        return void toast.error("دریافت مخاطبین انجام نشد");
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
        گفتگوی جدید
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
        {variant === "sidebar" ? "گفتگوی جدید" : "شروع گفتگو"}
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
  const typingNames = typing ? Object.values(typing) : null;
  const { lastMessage, unreadCount } = conversation;
  const isGroup = conversation.type === "GROUP";
  // «شما: …» for mine; «علی: …» for others in groups; system events as text.
  const prefix =
    !lastMessage || lastMessage.type === "SYSTEM"
      ? null
      : lastMessage.isMine
        ? "شما: "
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

  return (
    <Link
      href={`/chats/${conversation.id}`}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
              {formatListTime(conversation.lastMessageAt)}
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
              aria-label={`${toFaDigits(unreadCount)} پیام خوانده‌نشده`}
              className="flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
            >
              {unreadCount > 99 ? "+۹۹" : toFaDigits(unreadCount)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

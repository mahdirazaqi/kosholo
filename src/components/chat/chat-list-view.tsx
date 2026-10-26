"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCirclePlus, MessagesSquare } from "lucide-react";
import { NewChatSheet } from "@/components/chat/new-chat-sheet";
import { previewText } from "@/components/chat/message-preview";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { formatListTime } from "@/lib/format-date";
import type { ConversationListItem } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { cn } from "@/lib/utils";

export function ChatListView({
  conversations,
  contacts,
}: {
  conversations: ConversationListItem[];
  contacts: PublicUser[];
}) {
  const [newChatOpen, setNewChatOpen] = useState(false);

  return (
    <>
      <PageHeader title="گفتگوها" />

      {conversations.length === 0 ? (
        <div className="flex min-h-[calc(100%-3.5rem)] flex-col items-center justify-center gap-5 px-8 py-16 text-center">
          <div className="flex size-24 items-center justify-center rounded-[2rem] bg-muted">
            <MessagesSquare className="size-11 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">هنوز گفتگویی ندارید</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              یکی از مخاطبینتان را انتخاب کنید و اولین پیام را بفرستید.
            </p>
          </div>
          <Button size="lg" onClick={() => setNewChatOpen(true)} className="h-11 rounded-xl px-5 text-base">
            <MessageCirclePlus />
            شروع گفتگو
          </Button>
        </div>
      ) : (
        <ul className="px-2 pt-1 pb-28">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} />
            </li>
          ))}
        </ul>
      )}

      {conversations.length > 0 && (
        <Button
          size="lg"
          onClick={() => setNewChatOpen(true)}
          className="absolute end-[calc(1rem+max(env(safe-area-inset-left),env(safe-area-inset-right)))] bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 h-14 gap-2 rounded-2xl px-5 text-base shadow-lg shadow-primary/20"
        >
          <MessageCirclePlus className="size-5" />
          گفتگوی جدید
        </Button>
      )}

      <NewChatSheet open={newChatOpen} onOpenChange={setNewChatOpen} contacts={contacts} />
    </>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationListItem }) {
  const { lastMessage, unreadCount } = conversation;
  const avatarUser = conversation.otherUser ?? {
    id: conversation.id,
    name: conversation.title,
    avatarUrl: conversation.avatarUrl,
  };

  return (
    <Link
      href={`/chats/${conversation.id}`}
      className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted"
    >
      <UserAvatar user={avatarUser} size="lg" className="size-13" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{conversation.title}</span>
          {conversation.lastMessageAt && (
            <time
              dateTime={conversation.lastMessageAt}
              suppressHydrationWarning
              className={cn(
                "shrink-0 text-xs",
                unreadCount > 0 ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {formatListTime(conversation.lastMessageAt)}
            </time>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {lastMessage?.isMine && <span className="text-foreground/70">شما: </span>}
            {lastMessage && <bdi>{previewText(lastMessage)}</bdi>}
          </p>
          {unreadCount > 0 && (
            <span
              aria-label={`${unreadCount.toLocaleString("fa-IR")} پیام خوانده‌نشده`}
              className="flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
            >
              {unreadCount > 99 ? "+۹۹" : unreadCount.toLocaleString("fa-IR")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

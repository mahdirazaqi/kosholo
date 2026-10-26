"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadOlderMessages, markAsRead, sendMessage } from "@/app/(app)/chats/actions";
import { BackButton } from "@/components/back-button";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { MessageList, type MessageListHandle } from "@/components/chat/message-list";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport-height";
import { tempId } from "@/lib/client-utils";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import type { ChatConversation, ChatMessage, MessagesPage, ReplyPreview } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";

export function ChatView({
  conversation,
  currentUser,
  initialPage,
}: {
  conversation: ChatConversation;
  currentUser: PublicUser;
  initialPage: MessagesPage;
}) {
  useVisualViewportHeight();

  const [messages, setMessages] = useState(initialPage.messages);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const listRef = useRef<MessageListHandle>(null);

  // Refs so loadOlder stays stable and concurrent callers share one request.
  const cursorRef = useRef(cursor);
  const inflight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    void markAsRead(conversation.id);
  }, [conversation.id]);

  const loadOlder = useCallback((): Promise<boolean> => {
    if (inflight.current) return inflight.current;
    const before = cursorRef.current;
    if (!before) return Promise.resolve(false);

    setLoadingOlder(true);
    inflight.current = loadOlderMessages(conversation.id, before)
      .then((page) => {
        if (!page) return false;
        cursorRef.current = page.nextCursor;
        setCursor(page.nextCursor);
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          return [...page.messages.filter((message) => !known.has(message.id)), ...current];
        });
        return page.messages.length > 0;
      })
      .catch(() => {
        toast.error("بارگذاری پیام‌های قبلی انجام نشد");
        return false;
      })
      .finally(() => {
        inflight.current = null;
        setLoadingOlder(false);
      });
    return inflight.current;
  }, [conversation.id]);

  const deliver = useCallback(
    async (optimistic: ChatMessage) => {
      const replyToId =
        optimistic.replyTo && optimistic.replyTo !== "deleted" ? optimistic.replyTo.id : null;
      const replace = (update: (message: ChatMessage) => ChatMessage) =>
        setMessages((current) =>
          current.map((message) => (message.tempId === optimistic.tempId ? update(message) : message)),
        );

      try {
        const result = await sendMessage({
          conversationId: conversation.id,
          content: optimistic.content ?? "",
          replyToId,
        });
        if (result.ok) {
          // Keep tempId so the React key (and the bubble) stays the same.
          replace(() => ({ ...result.message, tempId: optimistic.tempId }));
        } else {
          replace((message) => ({ ...message, status: "failed" }));
          toast.error(result.error);
        }
      } catch {
        replace((message) => ({ ...message, status: "failed" }));
      }
    },
    [conversation.id],
  );

  const send = useCallback(
    (content: string) => {
      const id = tempId();
      const optimistic: ChatMessage = {
        id,
        tempId: id,
        conversationId: conversation.id,
        type: "TEXT",
        content,
        mediaUrl: null,
        createdAt: new Date().toISOString(),
        sender: currentUser,
        replyTo: replyTo ? toReplyPreview(replyTo) : null,
        status: "sending",
      };
      setMessages((current) => [...current, optimistic]);
      setReplyTo(null);
      void deliver(optimistic);
    },
    [conversation.id, currentUser, replyTo, deliver],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      setMessages((current) =>
        current.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)),
      );
      void deliver(message);
    },
    [deliver],
  );

  const startReply = useCallback((message: ChatMessage) => {
    setReplyTo(message);
    composerRef.current?.focus();
  }, []);

  const other = conversation.otherUser;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        start={<BackButton />}
        title={
          <span className="flex items-center gap-3">
            <UserAvatar
              user={other ?? { id: conversation.id, name: conversation.title, avatarUrl: conversation.avatarUrl }}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-base leading-tight">{conversation.title}</span>
              {other && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  <bdi dir="ltr">@{other.username}</bdi>
                </span>
              )}
            </span>
          </span>
        }
      />

      <MessageList
        ref={listRef}
        messages={messages}
        currentUserId={currentUser.id}
        conversationType={conversation.type}
        hasMore={cursor !== null}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onReply={startReply}
        onRetry={retry}
      />

      <Composer
        ref={composerRef}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
      />
    </div>
  );
}

function toReplyPreview(message: ChatMessage): ReplyPreview {
  return {
    id: message.id,
    type: message.type,
    content: message.content?.slice(0, PREVIEW_LENGTH) ?? null,
    senderName: message.sender.name,
  };
}

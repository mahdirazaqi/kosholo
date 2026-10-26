"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadOlderMessages, sendMessage } from "@/app/(app)/chats/actions";
import { BackButton } from "@/components/back-button";
import { ChatStatus } from "@/components/chat/chat-status";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { useConversationRealtime } from "@/hooks/use-conversation-realtime";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport-height";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { tempId } from "@/lib/client-utils";
import { lastConfirmedAt, mergeMessage } from "@/lib/realtime/client/merge";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_CLIENT_THROTTLE_MS } from "@/lib/realtime/events";
import type {
  ChatConversation,
  ChatMessage,
  MemberReadState,
  MessagesPage,
  ReplyPreview,
} from "@/lib/types/chat";
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
  const [readStates, setReadStates] = useState<MemberReadState[]>(conversation.readStates);
  const composerRef = useRef<ComposerHandle>(null);

  // Refs so loadOlder stays stable and concurrent callers share one request.
  const cursorRef = useRef(cursor);
  const inflight = useRef<Promise<boolean> | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const requestRead = useConversationRealtime({
    conversationId: conversation.id,
    onMessage: (message, incomingTempId) =>
      setMessages((current) => mergeMessage(current, message, incomingTempId)),
    onRead: (userId, lastReadAt) =>
      setReadStates((current) =>
        current.map((state) =>
          state.userId === userId && (state.lastReadAt ?? "") < lastReadAt
            ? { ...state, lastReadAt }
            : state,
        ),
      ),
    getLastConfirmedAt: () => lastConfirmedAt(messagesRef.current),
  });

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
      const markFailed = () =>
        setMessages((current) =>
          current.map((message) =>
            // Only if the socket hasn't already confirmed it.
            message.tempId === optimistic.tempId && message.status !== "sent"
              ? { ...message, status: "failed" }
              : message,
          ),
        );

      try {
        const result = await sendMessage({
          conversationId: conversation.id,
          content: optimistic.content ?? "",
          replyToId,
          tempId: optimistic.tempId,
        });
        if (result.ok) {
          // message:new may have arrived first; mergeMessage handles both orders.
          setMessages((current) => mergeMessage(current, result.message, optimistic.tempId));
        } else {
          markFailed();
          toast.error(result.error);
        }
      } catch {
        markFailed();
      }
    },
    [conversation.id],
  );

  // ---- Typing (throttled typing:start, typing:stop when done) ----
  const typing = useRef({ active: false, lastStart: 0 });
  const stopTyping = useCallback(() => {
    if (!typing.current.active) return;
    typing.current = { active: false, lastStart: 0 };
    getSocket().emit("typing:stop", conversation.id);
  }, [conversation.id]);
  const onInput = useCallback(
    (value: string) => {
      if (!value.trim()) return stopTyping();
      const now = Date.now();
      if (now - typing.current.lastStart < TYPING_CLIENT_THROTTLE_MS) return;
      typing.current = { active: true, lastStart: now };
      getSocket().emit("typing:start", conversation.id);
    },
    [conversation.id, stopTyping],
  );

  const send = useCallback(
    (content: string) => {
      stopTyping();
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
      requestRead.current();
      void deliver(optimistic);
    },
    [conversation.id, currentUser, replyTo, deliver, stopTyping, requestRead],
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
              <ChatStatus conversation={conversation} />
            </span>
          </span>
        }
      />

      <MessageList
        messages={messages}
        currentUserId={currentUser.id}
        conversationType={conversation.type}
        readStates={readStates}
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
        onInput={onInput}
        onBlur={stopTyping}
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

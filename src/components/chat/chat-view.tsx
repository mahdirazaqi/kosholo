"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { toast } from "sonner";
import { loadOlderMessages, sendMessage } from "@/app/(app)/chats/actions";
import { BackButton } from "@/components/back-button";
import { ChatStatus } from "@/components/chat/chat-status";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { useConversationRealtime } from "@/hooks/use-conversation-realtime";
import { useMediaSender } from "@/hooks/use-media-sender";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport-height";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { tempId } from "@/lib/client-utils";
import { lastConfirmedAt, mergeMessage } from "@/lib/realtime/client/merge";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_CLIENT_THROTTLE_MS } from "@/lib/realtime/events";
import { removeConversation, renameConversation } from "@/lib/realtime/client/store";
import type {
  ChatConversation,
  ChatMessage,
  ConversationRemovedReason,
  MemberReadState,
  MessagesPage,
  ReplyPreview,
} from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import type { PreparedFile } from "@/lib/media/client/prepare";
import type { VoiceRecording } from "@/hooks/use-media-sender";

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
  // Title and members change live in groups (conversation:updated).
  const [chat, setChat] = useState(conversation);
  const [removed, setRemoved] = useState<ConversationRemovedReason | null>(null);
  const memberNames = useMemo(() => new Map(chat.members.map((m) => [m.id, m.name])), [chat.members]);
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
    onUpdated: ({ title, avatarUrl, members }) => {
      setChat((current) => ({
        ...current,
        ...(title !== undefined && current.type === "GROUP" ? { title } : {}),
        ...(avatarUrl !== undefined && current.type === "GROUP" ? { avatarUrl } : {}),
        ...(members ? { members, memberCount: members.length } : {}),
      }));
      if (title !== undefined) renameConversation(conversation.id, title);
      if (members) {
        // Keep known read positions; drop people who left; add newcomers.
        setReadStates((current) =>
          members
            .filter((member) => member.id !== currentUser.id)
            .map((member) => ({
              userId: member.id,
              joinedAt: member.joinedAt,
              lastReadAt: current.find((state) => state.userId === member.id)?.lastReadAt ?? null,
            })),
        );
      }
    },
    onRemoved: (reason) => {
      setRemoved(reason);
      setReplyTo(null);
      removeConversation(conversation.id);
    },
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
        media: null,
        meta: null,
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

  const media = useMediaSender({ conversationId: conversation.id, currentUser, setMessages });
  const { isMediaPending, retry: retryMedia } = media;

  const retry = useCallback(
    (message: ChatMessage) => {
      // Media messages re-run their own pipeline (re-upload only if needed).
      if (isMediaPending(message.tempId)) return void retryMedia(message.tempId!);
      setMessages((current) =>
        current.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)),
      );
      void deliver(message);
    },
    [deliver, isMediaPending, retryMedia],
  );

  const sendFiles = useCallback(
    (files: PreparedFile[], caption: string | null) => {
      media.sendFiles(files, caption, replyTo ? toReplyPreview(replyTo) : null);
      setReplyTo(null);
      requestRead.current();
    },
    [media, replyTo, requestRead],
  );

  const sendVoice = useCallback(
    (recording: VoiceRecording) => {
      media.sendVoice(recording, replyTo ? toReplyPreview(replyTo) : null);
      setReplyTo(null);
      requestRead.current();
    },
    [media, replyTo, requestRead],
  );

  // Escape: close the reply bar, then (via Radix) an open picker/sheet/dialog,
  // then the chat itself. Captured on window so the reply bar goes first.
  const router = useRouter();
  const replyRef = useRef(replyTo);
  useEffect(() => {
    replyRef.current = replyTo;
  }, [replyTo]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (replyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setReplyTo(null);
        return;
      }
      const layerOpen = document.querySelector(
        '[role="dialog"], [data-radix-popper-content-wrapper], .yarl__root',
      );
      if (!layerOpen) router.push("/");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [router]);

  const startReply = useCallback((message: ChatMessage) => {
    setReplyTo(message);
    composerRef.current?.focus();
  }, []);

  const other = chat.otherUser;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        start={<BackButton />}
        title={
          // Tapping the header opens the info page.
          <Link
            href={`/chats/${chat.id}/info`}
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <UserAvatar
              user={other ?? { id: chat.id, name: chat.title, avatarUrl: chat.avatarUrl }}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-base leading-tight">{chat.title}</span>
              <ChatStatus conversation={chat} currentUserId={currentUser.id} />
            </span>
          </Link>
        }
      />

      <MessageList
        messages={messages}
        currentUserId={currentUser.id}
        conversationType={chat.type}
        memberNames={memberNames}
        readStates={readStates}
        hasMore={cursor !== null}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onReply={startReply}
        onRetry={retry}
        onCancelUpload={media.cancel}
      />

      {removed ? (
        // Non-dismissable: the user can still read what's loaded, not send.
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-t bg-muted/60 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-sm font-medium text-muted-foreground"
        >
          <UserX className="size-4.5" />
          {removed === "deleted" ? "این گروه حذف شده است" : "شما دیگر عضو این گروه نیستید"}
        </div>
      ) : (
        <Composer
          ref={composerRef}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={send}
          onSendFiles={sendFiles}
          onSendVoice={sendVoice}
          onInput={onInput}
          onBlur={stopTyping}
        />
      )}
    </div>
  );
}

function toReplyPreview(message: ChatMessage): ReplyPreview {
  return {
    id: message.id,
    type: message.type,
    content: message.content?.slice(0, PREVIEW_LENGTH) ?? null,
    senderName: message.sender.name,
    thumbUrl: message.media?.thumbUrl ?? null,
    duration: message.media?.duration ?? null,
  };
}

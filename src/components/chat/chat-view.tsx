"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, EllipsisVertical, Megaphone, Trash2, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { getChannelStats, loadOlderMessages, sendMessage, setMuted } from "@/app/(app)/chats/actions";
import { deleteMessages } from "@/app/(app)/chats/delete-actions";
import { BackButton } from "@/components/back-button";
import { ChatStatus } from "@/components/chat/chat-status";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { conversationActionItems, useConversationActions } from "@/components/chat/conversation-actions";
import { DeleteDialog } from "@/components/chat/delete-dialog";
import { MessageList } from "@/components/chat/message-list";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationRealtime } from "@/hooks/use-conversation-realtime";
import { useFileSender } from "@/hooks/use-file-sender";
import { useMediaSender } from "@/hooks/use-media-sender";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport-height";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { canDeleteForEveryone, canPost } from "@/lib/chat/permissions";
import { tempId } from "@/lib/client-utils";
import { audioManager } from "@/lib/media/client/audio-manager";
import { formatCount } from "@/lib/numbers";
import { lastConfirmedAt, mergeMessage } from "@/lib/realtime/client/merge";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_CLIENT_THROTTLE_MS } from "@/lib/realtime/events";
import { isLocalDelete, patchConversation, removeConversation, renameConversation } from "@/lib/realtime/client/store";
import type {
  ChatConversation,
  ChatLocation,
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
  const router = useRouter();

  // ---- Deleting messages ----
  // Selection mode (null = off) holds message ids; `removing` are fading out.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  const [deleteTargets, setDeleteTargets] = useState<ChatMessage[] | null>(null);
  // From the conversation itself: channels never send their member list to subscribers.
  const myRole = chat.myRole;
  const isChannel = chat.type === "CHANNEL";
  const mayPost = canPost(chat.type, myRole);
  const conversationActions = useConversationActions(
    { id: chat.id, type: chat.type, title: chat.title, myRole, muted: chat.muted, isOwner: chat.isOwner },
    { onMuted: (muted) => setChat((current) => ({ ...current, muted })) },
  );

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
    onUpdated: ({ title, avatarUrl, members, description, signMessages, memberCount, myRole: role, isOwner, muted }) => {
      setChat((current) => ({
        ...current,
        ...(title !== undefined && current.type !== "DIRECT" ? { title } : {}),
        ...(avatarUrl !== undefined && current.type !== "DIRECT" ? { avatarUrl } : {}),
        ...(members ? { members, memberCount: members.length } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(signMessages !== undefined ? { signMessages } : {}),
        ...(memberCount !== undefined ? { memberCount } : {}),
        ...(role !== undefined ? { myRole: role } : {}),
        ...(isOwner !== undefined ? { isOwner } : {}),
        ...(muted !== undefined ? { muted } : {}),
      }));
      if (role !== undefined) {
        patchConversation(conversation.id, { myRole: role });
        // Demoted: the composer is gone, so drop a pending reply or selection.
        if (!canPost(conversation.type, role)) {
          setReplyTo(null);
          setSelection(null);
        }
      }
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
      setSelection(null);
      removeConversation(conversation.id);
    },
    onDeleted: (messageIds) => removeLocally(messageIds),
    onCleared: (before) =>
      removeLocally(
        messagesRef.current.filter((m) => m.status === "sent" && m.createdAt <= before).map((m) => m.id),
      ),
    onConversationDeleted: () => {
      removeConversation(conversation.id);
      if (!isLocalDelete(conversation.id)) toast("This chat was deleted");
      router.replace("/");
    },
    getLastConfirmedAt: () => lastConfirmedAt(messagesRef.current),
    getKnownIds: () => messagesRef.current.filter((m) => m.status === "sent").map((m) => m.id),
  });

  // Removes messages from the screen (fade-out first) and everything pointing
  // at them: the reply bar, quotes, selection and a playing voice/video.
  // Returns what's needed to put them back if the server says no.
  function removeLocally(ids: string[]) {
    const gone = new Set(ids);
    const removed = messagesRef.current.filter((m) => gone.has(m.id));
    if (removed.length === 0) return null;
    const quotes = new Map<string, ChatMessage["replyTo"]>();
    for (const m of messagesRef.current) {
      if (m.replyTo && m.replyTo !== "deleted" && gone.has(m.replyTo.id)) quotes.set(m.id, m.replyTo);
    }

    audioManager.release(removed.flatMap((m) => (m.media ? [m.media.url] : [])));
    setReplyTo((current) => (current && gone.has(current.id) ? null : current));
    setSelection((current) => (current ? new Set([...current].filter((id) => !gone.has(id))) : current));
    setMessages((current) =>
      current.map((m) => (quotes.has(m.id) ? { ...m, replyTo: "deleted" as const } : m)),
    );
    setRemoving((current) => new Set([...current, ...gone]));
    setTimeout(() => {
      setMessages((current) => current.filter((m) => !gone.has(m.id)));
      setRemoving((current) => new Set([...current].filter((id) => !gone.has(id))));
    }, REMOVE_ANIMATION_MS);
    return { removed, quotes };
  }

  function restore(snapshot: NonNullable<ReturnType<typeof removeLocally>>) {
    const ids = new Set(snapshot.removed.map((m) => m.id));
    setRemoving((current) => new Set([...current].filter((id) => !ids.has(id))));
    setMessages((current) =>
      snapshot.removed
        .reduce((list, message) => mergeMessage(list, message), current)
        .map((m) => (snapshot.quotes.has(m.id) && m.replyTo === "deleted" ? { ...m, replyTo: snapshot.quotes.get(m.id)! } : m)),
    );
  }

  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const startSelection = useCallback((message: ChatMessage) => {
    setReplyTo(null);
    setSelection(new Set([message.id]));
  }, []);
  const toggleSelection = useCallback((message: ChatMessage) => {
    if (message.status !== "sent") return;
    setSelection((current) => {
      if (!current) return current;
      const next = new Set(current);
      if (!next.delete(message.id)) next.add(message.id);
      return next;
    });
  }, []);
  // Channels: view counts are refetched for the loaded posts every 30s while
  // the channel is open and visible (never pushed per read).
  useEffect(() => {
    if (!isChannel) return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const ids = messagesRef.current.filter((m) => m.status === "sent" && m.type !== "SYSTEM").map((m) => m.id);
      try {
        const stats = await getChannelStats(conversation.id, ids);
        if (!stats) return;
        setMessages((current) =>
          current.map((m) =>
            m.type !== "SYSTEM" && m.status === "sent"
              ? { ...m, views: Math.max(stats.views[m.id] ?? 0, m.views ?? 0) }
              : m,
          ),
        );
        setChat((current) => ({ ...current, memberCount: stats.memberCount }));
      } catch {
        // Next tick retries.
      }
    };
    const timer = setInterval(() => void refresh(), CHANNEL_STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isChannel, conversation.id]);

  const toggleMute = useCallback(() => {
    const next = !chat.muted;
    setChat((current) => ({ ...current, muted: next }));
    patchConversation(chat.id, { muted: next });
    void setMuted(chat.id, next)
      .then((result) => {
        if (!result.ok) throw new Error();
      })
      .catch(() => {
        setChat((current) => ({ ...current, muted: !next }));
        patchConversation(chat.id, { muted: !next });
        toast.error("Couldn't change the notification setting");
      });
  }, [chat.id, chat.muted]);

  const askDelete = useCallback((message: ChatMessage) => setDeleteTargets([message]), []);
  const askDeleteSelection = useCallback(() => {
    const ids = selectionRef.current;
    if (!ids?.size) return;
    setDeleteTargets(messagesRef.current.filter((m) => ids.has(m.id)));
  }, []);

  // Optimistic: gone from the screen at once, back with an error if it fails.
  function confirmDelete(forEveryone: boolean) {
    const targets = deleteTargets;
    setDeleteTargets(null);
    setSelection(null);
    if (!targets?.length) return;
    const snapshot = removeLocally(targets.map((m) => m.id));
    const fail = (error: string) => {
      toast.error(error);
      if (snapshot) restore(snapshot);
    };
    deleteMessages({ conversationId: conversation.id, messageIds: targets.map((m) => m.id), forEveryone })
      .then((result) => {
        if (!result.ok) return fail(result.error);
        if (result.conversationDeleted) {
          removeConversation(conversation.id);
          router.replace("/");
        }
      })
      .catch(() => fail("Couldn't delete, please try again"));
  }

  const everyoneAllowed =
    deleteTargets !== null &&
    deleteTargets.every((m) =>
      canDeleteForEveryone({ id: currentUser.id, role: myRole, conversationType: chat.type }, { senderId: m.sender.id, type: m.type }),
    );

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
        toast.error("Couldn't load older messages");
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
          location: optimistic.location,
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

  // Text and location messages: an optimistic bubble, then sendMessage.
  const send = useCallback(
    (content: string, location: ChatLocation | null = null) => {
      stopTyping();
      const id = tempId();
      const optimistic: ChatMessage = {
        id,
        tempId: id,
        conversationId: conversation.id,
        type: location ? "LOCATION" : "TEXT",
        content: location ? null : content,
        media: null,
        location,
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

  const sendLocation = useCallback((location: ChatLocation) => send("", location), [send]);

  const media = useMediaSender({ conversationId: conversation.id, currentUser, setMessages });
  const { isMediaPending, retry: retryMedia } = media;
  const documents = useFileSender({ conversationId: conversation.id, currentUser, setMessages });

  const retry = useCallback(
    (message: ChatMessage) => {
      // Media and files re-run their own pipeline (re-upload only if needed).
      if (documents.isPending(message.tempId)) return documents.retry(message);
      if (isMediaPending(message.tempId)) return void retryMedia(message.tempId!);
      setMessages((current) =>
        current.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)),
      );
      void deliver(message);
    },
    [deliver, isMediaPending, retryMedia, documents],
  );

  const cancelUpload = useCallback(
    (message: ChatMessage) =>
      documents.isPending(message.tempId) ? documents.cancel(message) : media.cancel(message),
    [documents, media],
  );

  const sendDocuments = useCallback(
    (files: File[], caption: string | null) => {
      documents.sendDocuments(files, caption, replyTo ? toReplyPreview(replyTo) : null);
      setReplyTo(null);
      requestRead.current();
    },
    [documents, replyTo, requestRead],
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

  // Escape: leave selection mode, close the reply bar, then (via Radix) an
  // open picker/sheet/dialog, then the chat itself. Captured on window so
  // selection and the reply bar go first. Delete: delete the selection.
  const replyRef = useRef(replyTo);
  useEffect(() => {
    replyRef.current = replyTo;
  }, [replyTo]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const layerOpen = document.querySelector(
        '[role="dialog"], [data-radix-popper-content-wrapper], .yarl__root',
      );
      if (event.key === "Delete" && selectionRef.current && !layerOpen) {
        event.preventDefault();
        askDeleteSelection();
        return;
      }
      if (event.key !== "Escape") return;
      if (selectionRef.current && !layerOpen) {
        event.preventDefault();
        event.stopPropagation();
        setSelection(null);
        return;
      }
      if (replyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setReplyTo(null);
        return;
      }
      if (!layerOpen) router.push("/");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [router, askDeleteSelection]);

  const startReply = useCallback((message: ChatMessage) => {
    setReplyTo(message);
    composerRef.current?.focus();
  }, []);

  const other = chat.otherUser;
  const selectedCount = selection?.size ?? 0;

  return (
    <div className="flex h-full flex-col">
      {selection ? (
        <PageHeader
          start={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Cancel selection"
              onClick={() => setSelection(null)}
              className="-ms-2 size-11 rounded-full"
            >
              <X className="size-6" />
            </Button>
          }
          title={<span aria-live="polite">{formatCount(selectedCount, "message")} selected</span>}
          end={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Delete selected messages"
              disabled={selectedCount === 0}
              onClick={askDeleteSelection}
              className="-me-2 size-11 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-5.5" />
            </Button>
          }
        />
      ) : (
        <PageHeader
          start={<BackButton />}
          end={
            !removed && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-lg" aria-label="Chat options" className="-me-2 size-11 rounded-full">
                    <EllipsisVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  {conversationActionItems(
                    { id: chat.id, type: chat.type, title: chat.title, myRole, muted: chat.muted, isOwner: chat.isOwner },
                    { withDeleteGroup: true },
                  ).map((item) => (
                    <DropdownMenuItem
                      key={item.kind}
                      variant={item.destructive ? "destructive" : "default"}
                      onSelect={() => conversationActions.open(item.kind)}
                    >
                      {item.icon}
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }
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
                <span className="flex items-center gap-1 text-base leading-tight">
                  {isChannel && <Megaphone aria-label="Channel" className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{chat.title}</span>
                  {chat.muted && <BellOff aria-label="Muted" className="size-3.5 shrink-0 text-muted-foreground" />}
                </span>
                <ChatStatus conversation={chat} currentUserId={currentUser.id} />
              </span>
            </Link>
          }
        />
      )}

      <MessageList
        messages={messages}
        currentUserId={currentUser.id}
        conversationType={chat.type}
        channelTitle={isChannel ? chat.title : undefined}
        isAdmin={myRole === "ADMIN"}
        memberNames={memberNames}
        readStates={readStates}
        hasMore={cursor !== null}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onReply={startReply}
        onRetry={retry}
        onCancelUpload={cancelUpload}
        onResumeUpload={documents.resume}
        selection={selection}
        removing={removing}
        onSelect={startSelection}
        onToggleSelect={toggleSelection}
        onDelete={askDelete}
      />

      {removed ? (
        // Non-dismissable: the user can still read what's loaded, not send.
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-t bg-muted/60 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-sm font-medium text-muted-foreground"
        >
          <UserX className="size-4.5" />
          {removed === "deleted"
            ? `This ${isChannel ? "channel" : "group"} was deleted`
            : `You're no longer ${isChannel ? "subscribed to this channel" : "a member of this group"}`}
        </div>
      ) : !mayPost ? (
        // Channel subscribers can't post: one full-width mute switch instead.
        <div className="shrink-0 border-t bg-background px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <Button
            variant="ghost"
            size="lg"
            onClick={toggleMute}
            className="h-12 w-full gap-2 rounded-xl text-base font-semibold text-primary"
          >
            {chat.muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            {chat.muted ? "Unmute" : "Mute"}
          </Button>
        </div>
      ) : (
        // Disabled (not unmounted, so a draft survives) while selecting.
        <div inert={selection !== null} className={selection ? "shrink-0 opacity-50" : "shrink-0"}>
          <Composer
            ref={composerRef}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={send}
            onSendFiles={sendFiles}
            onSendDocuments={sendDocuments}
            onSendLocation={sendLocation}
            onSendVoice={sendVoice}
            onInput={onInput}
            onBlur={stopTyping}
          />
        </div>
      )}

      <DeleteDialog
        open={deleteTargets !== null}
        onOpenChange={(open) => !open && setDeleteTargets(null)}
        title={
          deleteTargets && deleteTargets.length > 1
            ? `Delete ${formatCount(deleteTargets.length, "message")}?`
            : "Delete message?"
        }
        everyoneLabel={
          everyoneAllowed ? (chat.type === "DIRECT" ? `Also delete for ${chat.title}` : "Delete for everyone") : null
        }
        alwaysEveryone={isChannel}
        description={isChannel ? "It will be removed for every subscriber." : undefined}
        onConfirm={confirmDelete}
      />
      {conversationActions.dialog}
    </div>
  );
}

const REMOVE_ANIMATION_MS = 200;
const CHANNEL_STATS_INTERVAL_MS = 30_000;

function toReplyPreview(message: ChatMessage): ReplyPreview {
  return {
    id: message.id,
    type: message.type,
    content: message.content?.slice(0, PREVIEW_LENGTH) ?? null,
    senderName: message.sender.name,
    thumbUrl: message.media?.thumbUrl ?? null,
    duration: message.media?.duration ?? null,
    fileName: message.media?.originalName ?? null,
    location: message.location,
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Bookmark, EllipsisVertical, Forward, Megaphone, Trash2, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { getChannelStats, getFirstUnreadMessageId, getMessagesSince, loadMessages, sendMessage, setMuted } from "@/app/(app)/chats/actions";
import { deleteMessages } from "@/app/(app)/chats/delete-actions";
import { editMessage } from "@/app/(app)/chats/edit-actions";
import { ensureDirectConversation, forwardMessages } from "@/app/(app)/chats/forward-actions";
import { checkForwardOrigin, saveMessages } from "@/app/(app)/chats/saved-actions";
import { BackButton } from "@/components/back-button";
import { ChatStatus } from "@/components/chat/chat-status";
import { Composer, type ComposerHandle } from "@/components/chat/composer";
import { conversationActionItems, useConversationActions } from "@/components/chat/conversation-actions";
import { DeleteDialog } from "@/components/chat/delete-dialog";
import { ForwardPicker, type ForwardDraft, type PickedTarget } from "@/components/chat/forward-picker";
import { MessageList, type MessageListHandle } from "@/components/chat/message-list";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBackLayer } from "@/hooks/use-back-layer";
import { useConversationRealtime } from "@/hooks/use-conversation-realtime";
import { useFileSender } from "@/hooks/use-file-sender";
import { useMediaSender } from "@/hooks/use-media-sender";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { setPendingJump, takePendingJump } from "@/lib/chat/pending-jump";
import { encodeCursor } from "@/lib/chat/cursor";
import { canDeleteForEveryone, canPost, editBlock } from "@/lib/chat/permissions";
import { tempId, vibrate } from "@/lib/client-utils";
import { audioManager } from "@/lib/media/client/audio-manager";
import { formatCount } from "@/lib/numbers";
import { applyEdit, lastConfirmedAt, mergeMessage, mergePage } from "@/lib/realtime/client/merge";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_CLIENT_THROTTLE_MS } from "@/lib/realtime/events";
import { cacheMessages, getCachedMessages, isLocalDelete, patchConversation, removeConversation, renameConversation, setPendingForward, useRealtimeStore } from "@/lib/realtime/client/store";
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

  // Messages in the cache (this session) are shown at once and merged with the
  // fresh latest page, but only if the two overlap (otherwise there'd be a gap).
  const [{ messages: startMessages, hasOlder: startHasOlder, fromCache }] = useState(() => {
    const cached = getCachedMessages(conversation.id);
    const first = initialPage.messages[0];
    const last = cached?.messages.at(-1);
    if (cached && first && last && first.createdAt <= last.createdAt) {
      return { messages: mergePage(cached.messages, initialPage.messages), hasOlder: cached.hasOlder, fromCache: cached.messages };
    }
    return { messages: initialPage.messages, hasOlder: initialPage.hasOlder, fromCache: null };
  });
  const [messages, setMessages] = useState(startMessages);
  // Paging state (the contract is in lib/chat/messages.ts). `hasNewer` means the
  // list is a window in the middle of the history (after a jump), not attached to the latest.
  const [hasOlder, setHasOlder] = useState(startHasOlder);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [olderError, setOlderError] = useState(false);
  // A new window (jump / back to latest) remounts the list; `initialMessageId`
  // is where it starts (centered), null = the bottom.
  const [windowKey, setWindowKey] = useState(0);
  const [initialMessageId, setInitialMessageId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<MessageListHandle>(null);
  // The first message I hadn't read when opening the chat. The divider above it
  // stays while I'm in the chat; it only exists if that message is in the loaded
  // range (a first unread older than the page is reached with the jump button).
  const [firstUnreadId] = useState(() => {
    const index = startMessages.findIndex(
      (m) =>
        m.type !== "SYSTEM" &&
        m.sender.id !== currentUser.id &&
        (conversation.lastReadAt === null || m.createdAt > conversation.lastReadAt),
    );
    return index < 0 || (index === 0 && startHasOlder) ? null : startMessages[index].id;
  });
  // Unread count at open, for the jump button (the store clears it as I read).
  const [unreadAtOpen, setUnreadAtOpen] = useState(
    () => useRealtimeStore.getState().unread?.[conversation.id]?.count ?? 0,
  );
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // The forward picker (messages chosen to forward) and the forward waiting in
  // this composer (kept in the store so it survives navigating away and back).
  const [forwardDraft, setForwardDraft] = useState<ForwardDraft | null>(null);
  const pendingForward = useRealtimeStore((state) => state.pendingForwards[conversation.id]) ?? null;
  const forwardRetries = useRef(
    new Map<string, { sourceConversationId: string; messageId: string; hideSender: boolean; hideCaptions: boolean }>(),
  );
  // Edit mode and reply mode are mutually exclusive (and with a pending forward).
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  // The delete dialog was opened because an edit emptied a text message.
  const [emptyEditPrompt, setEmptyEditPrompt] = useState(false);
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
  const isSaved = chat.type === "SAVED";
  const mayPost = canPost(chat.type, myRole);
  // Android back / browser back closes these before leaving the chat.
  useBackLayer(selection !== null, () => setSelection(null));
  useBackLayer(replyTo !== null, () => setReplyTo(null));
  useBackLayer(editing !== null, () => setEditing(null));
  useBackLayer(pendingForward !== null, () => setPendingForward(conversation.id, null));
  const conversationActions = useConversationActions(
    { id: chat.id, type: chat.type, title: chat.title, myRole, muted: chat.muted, isOwner: chat.isOwner },
    { onMuted: (muted) => setChat((current) => ({ ...current, muted })) },
  );

  // Refs so loadOlder stays stable and concurrent callers share one request.
  const inflightOlder = useRef(false);
  const inflightNewer = useRef(false);
  const hasOlderRef = useRef(hasOlder);
  const hasNewerRef = useRef(hasNewer);
  useEffect(() => {
    hasOlderRef.current = hasOlder;
    hasNewerRef.current = hasNewer;
  }, [hasOlder, hasNewer]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const requestRead = useConversationRealtime({
    conversationId: conversation.id,
    onMessage: (message, incomingTempId) => {
      // Detached (a window after a jump): newer messages are loaded when the
      // list reconnects with the latest; only my own pending sends merge now.
      if (hasNewerRef.current && !messagesRef.current.some((m) => m.tempId !== undefined && m.tempId === incomingTempId)) return;
      setMessages((current) => mergeMessage(current, message, incomingTempId));
    },
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
    onEdited: (edit) => {
      setMessages((current) => applyEdit(current, edit));
      setReplyTo((current) =>
        current && current.id === edit.messageId ? { ...current, content: edit.content, editedAt: edit.editedAt } : current,
      );
    },
    initialSyncAt: conversation.loadedAt,
    getOldestLoadedAt: () => messagesRef.current.find((m) => m.status === "sent")?.createdAt ?? null,
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
    setEditing((current) => (current && gone.has(current.id) ? null : current));
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

  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const startSelection = useCallback((message: ChatMessage) => {
    if (editingRef.current) return; // no multi-select while editing
    vibrate(10);
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

  const askDelete = useCallback((message: ChatMessage) => {
    setEmptyEditPrompt(false);
    setDeleteTargets([message]);
  }, []);
  const askDeleteSelection = useCallback(() => {
    const ids = selectionRef.current;
    if (!ids?.size) return;
    setDeleteTargets(messagesRef.current.filter((m) => ids.has(m.id)));
  }, []);

  // Optimistic: gone from the screen at once, back with an error if it fails.
  function confirmDelete(forEveryone: boolean) {
    const targets = deleteTargets;
    setDeleteTargets(null);
    setEmptyEditPrompt(false);
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

  // One request in flight at a time, repeated triggers are ignored, and nothing
  // is requested once there is nothing older. Prepending keeps the view still
  // (the list shifts its firstItemIndex by the number of items added).
  const loadOlder = useCallback(async () => {
    if (inflightOlder.current || !hasOlderRef.current) return;
    const first = messagesRef.current.find((m) => m.status === "sent");
    if (!first) return;
    inflightOlder.current = true;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await loadMessages(conversation.id, { before: encodeCursor(first) });
      if (!page) throw new Error("no page");
      setMessages((current) => mergePage(current, page.messages));
      setHasOlder(page.hasOlder);
    } catch {
      setOlderError(true); // a small "Try again" at the top, no toast
    } finally {
      inflightOlder.current = false;
      setLoadingOlder(false);
    }
  }, [conversation.id]);

  // Detached: scrolling down loads newer pages until hasNewer is false, which
  // reattaches the list to the latest messages.
  const loadNewer = useCallback(async () => {
    if (inflightNewer.current || !hasNewerRef.current) return;
    const last = [...messagesRef.current].reverse().find((m) => m.status === "sent");
    if (!last) return;
    inflightNewer.current = true;
    setLoadingNewer(true);
    try {
      const page = await loadMessages(conversation.id, { after: encodeCursor(last) });
      if (!page) throw new Error("no page");
      setMessages((current) => mergePage(current, page.messages));
      setHasNewer(page.hasNewer);
    } catch {
      // The next scroll to the end tries again.
    } finally {
      inflightNewer.current = false;
      setLoadingNewer(false);
    }
  }, [conversation.id]);

  // Starts a new window: the list remounts positioned at `startAt` (or the bottom).
  const openWindow = useCallback((page: MessagesPage, startAt: string | null) => {
    // What is still being sent stays (sorted by time at the end).
    setMessages((current) => mergePage(current.filter((m) => m.status !== "sent"), page.messages));
    setHasOlder(page.hasOlder);
    setHasNewer(page.hasNewer);
    setOlderError(false);
    setInitialMessageId(startAt);
    setWindowKey((key) => key + 1);
  }, []);

  const flash = useCallback((messageId: string) => {
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((current) => (current === messageId ? null : current)), 1500);
  }, []);

  // Jump to a message (a quote's original, a forward's original): the window
  // around it, never "load everything in between".
  const jumpTo = useCallback(
    async (messageId: string) => {
      try {
        const page = await loadMessages(conversation.id, { around: messageId });
        if (!page) return void toast.error("Original message not found");
        openWindow(page, messageId);
        flash(messageId);
      } catch {
        toast.error("Couldn't load the message, please try again");
      }
    },
    [conversation.id, openWindow, flash],
  );

  // Back to the latest: the newest page, not everything in between.
  const jumpToLatest = useCallback(async () => {
    try {
      const page = await loadMessages(conversation.id);
      if (!page) return;
      openWindow(page, null);
    } catch {
      toast.error("Couldn't load the latest messages");
    }
  }, [conversation.id, openWindow]);

  const jumpToFirstUnread = useCallback(async () => {
    setUnreadAtOpen(0);
    try {
      const id = await getFirstUnreadMessageId(conversation.id, conversation.lastReadAt);
      if (id) await jumpTo(id);
    } catch {
      toast.error("Couldn't load the message, please try again");
    }
  }, [conversation.id, conversation.lastReadAt, jumpTo]);

  // "Forwarded from …" opened this chat to show one message.
  useEffect(() => {
    const target = takePendingJump(conversation.id);
    if (target) queueMicrotask(() => void jumpTo(target));
    // Once per mount: the request is consumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sending from a detached window first goes back to the latest.
  const sendingWhileDetached = hasNewer && messages.some((m) => m.status === "sending");
  useEffect(() => {
    if (sendingWhileDetached) queueMicrotask(() => void jumpToLatest());
  }, [sendingWhileDetached, jumpToLatest]);

  // Cache what was loaded (the latest window) for the next visit, and drop
  // messages deleted while this chat was closed when it was restored from cache.
  const hasOlderForCache = useRef(hasOlder);
  useEffect(() => {
    hasOlderForCache.current = hasOlder;
  }, [hasOlder]);
  useEffect(() => {
    if (!fromCache) return;
    const since = initialPage.messages[0]?.createdAt;
    if (!since) return;
    getMessagesSince(conversation.id, since, fromCache.map((m) => m.id))
      .then((result) => result?.goneIds.length && removeLocally(result.goneIds))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () => () => {
      if (!hasNewerRef.current) cacheMessages(conversation.id, messagesRef.current, hasOlderForCache.current);
    },
    [conversation.id],
  );

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
      if (conversation.type === "SAVED") return; // nobody to tell
      if (!value.trim()) return stopTyping();
      const now = Date.now();
      if (now - typing.current.lastStart < TYPING_CLIENT_THROTTLE_MS) return;
      typing.current = { active: true, lastStart: now };
      getSocket().emit("typing:start", conversation.id);
    },
    [conversation.id, conversation.type, stopTyping],
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

  // Retrying a failed copy forwards just that message again.
  const retryForward = useCallback(
    async (message: ChatMessage) => {
      const info = message.tempId ? forwardRetries.current.get(message.tempId) : undefined;
      if (!info || !message.tempId) return false;
      const id = message.tempId;
      setMessages((current) => current.map((m) => (m.tempId === id ? { ...m, status: "sending" } : m)));
      try {
        const result = await forwardMessages({
          sourceConversationId: info.sourceConversationId,
          messageIds: [info.messageId],
          targets: [{ conversationId: conversation.id }],
          hideSender: info.hideSender,
          hideCaptions: info.hideCaptions,
          tempIds: [id],
        });
        const target = result.ok ? result.results[0] : null;
        if (!target?.ok || !target.messages[0]) throw new Error(result.ok ? target?.error : result.error);
        setMessages((current) => mergeMessage(current, target.messages[0], id));
        forwardRetries.current.delete(id);
      } catch (error) {
        setMessages((current) => current.map((m) => (m.tempId === id && m.status !== "sent" ? { ...m, status: "failed" } : m)));
        toast.error(error instanceof Error && error.message ? error.message : "Couldn't forward");
      }
      return true;
    },
    [conversation.id],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (message.tempId && forwardRetries.current.has(message.tempId)) return void retryForward(message);
      // Media and files re-run their own pipeline (re-upload only if needed).
      if (documents.isPending(message.tempId)) return documents.retry(message);
      if (isMediaPending(message.tempId)) return void retryMedia(message.tempId!);
      setMessages((current) =>
        current.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)),
      );
      void deliver(message);
    },
    [deliver, isMediaPending, retryMedia, documents, retryForward],
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
      if (useRealtimeStore.getState().pendingForwards[conversation.id] && !layerOpen) {
        event.preventDefault();
        event.stopPropagation();
        setPendingForward(conversation.id, null);
        return;
      }
      if (editingRef.current && !layerOpen) {
        event.preventDefault();
        event.stopPropagation();
        setEditing(null);
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
  }, [router, askDeleteSelection, conversation.id]);

  // May I edit this message right now? (The server checks again.)
  const canEditMessage = useCallback(
    (message: ChatMessage) =>
      message.status === "sent" &&
      editBlock(
        { id: currentUser.id, role: myRole, conversationType: chat.type },
        { senderId: message.sender.id, type: message.type, createdAt: message.createdAt, forwarded: Boolean(message.forward) },
        chat.editWindowHours,
      ) === null,
    [currentUser.id, myRole, chat.type, chat.editWindowHours],
  );

  // Copies messages into Saved Messages (independent copies; files are shared,
  // not duplicated). The toast links to the Saved Messages chat.
  const save = useCallback(
    async (targets: ChatMessage[]) => {
      const ids = targets.filter((m) => m.status === "sent" && m.type !== "SYSTEM").map((m) => m.id);
      if (ids.length === 0) return toast.error("Service messages can't be saved");
      try {
        const result = await saveMessages({ conversationId: conversation.id, messageIds: ids });
        if (!result.ok) return void toast.error(result.error);
        toast.success(
          ids.length === 1 ? "Saved to Saved Messages" : `${formatCount(ids.length, "message")} saved`,
          { action: { label: "View", onClick: () => router.push(`/chats/${result.savedConversationId}`) } },
        );
      } catch {
        toast.error("Couldn't save, please try again");
      }
    },
    [conversation.id, router],
  );
  const saveOne = useCallback((message: ChatMessage) => void save([message]), [save]);
  const saveSelection = useCallback(() => {
    const ids = selectionRef.current;
    if (!ids?.size) return;
    // In their original order.
    const picked = messagesRef.current.filter((m) => ids.has(m.id));
    setSelection(null);
    void save(picked);
  }, [save]);

  // "Forwarded from …": open the original and scroll to it, if it still exists
  // and I can see it.
  const openForward = useCallback(
    async (message: ChatMessage) => {
      const origin = message.forward;
      const unavailable = () => toast("The original message isn't available");
      if (!origin?.conversationId || !origin.messageId) return unavailable();
      try {
        if (!(await checkForwardOrigin(origin.conversationId, origin.messageId))) return unavailable();
      } catch {
        return unavailable();
      }
      setPendingJump(origin.conversationId, origin.messageId);
      router.push(`/chats/${origin.conversationId}`);
    },
    [router],
  );

  // ---- Forwarding ----
  const startForward = useCallback(
    (messages: ChatMessage[]) => {
      const sendable = messages.filter((m) => m.status === "sent" && m.type !== "SYSTEM");
      if (sendable.length === 0) return void toast.error("Service messages can't be forwarded");
      setForwardDraft({ sourceConversationId: conversation.id, messages: sendable });
    },
    [conversation.id],
  );
  const forwardOne = useCallback((message: ChatMessage) => startForward([message]), [startForward]);
  const forwardSelection = useCallback(() => {
    const ids = selectionRef.current;
    if (!ids?.size) return;
    startForward(messagesRef.current.filter((m) => ids.has(m.id))); // original order
  }, [startForward]);

  // One target picked: the messages wait in that chat's composer (a contact
  // without a chat gets its direct conversation created now). Changing the
  // recipient moves the pending forward and keeps its options.
  const pickForwardTarget = useCallback(
    async (target: PickedTarget) => {
      if (!forwardDraft) return;
      let targetId: string;
      if ("userId" in target) {
        const result = await ensureDirectConversation(target.userId).catch(() => null);
        if (!result?.ok) return void toast.error(result?.error ?? "Couldn't open the chat");
        targetId = result.conversationId;
      } else {
        targetId = target.conversationId;
      }
      const previous = useRealtimeStore.getState().pendingForwards[conversation.id];
      setPendingForward(targetId, {
        sourceConversationId: forwardDraft.sourceConversationId,
        messages: forwardDraft.messages,
        hideSender: previous?.hideSender ?? false,
        hideCaptions: previous?.hideCaptions ?? false,
      });
      if (previous && targetId !== conversation.id) setPendingForward(conversation.id, null);
      setSelection(null);
      setReplyTo(null);
      setEditing(null);
      if (targetId !== conversation.id) router.push(`/chats/${targetId}`);
    },
    [forwardDraft, conversation.id, router],
  );

  const forwardAction = useCallback(
    (action: "toggleSender" | "toggleCaptions" | "change" | "cancel") => {
      const pending = useRealtimeStore.getState().pendingForwards[conversation.id];
      if (!pending) return;
      if (action === "cancel") return setPendingForward(conversation.id, null);
      if (action === "change") {
        return setForwardDraft({ sourceConversationId: pending.sourceConversationId, messages: pending.messages });
      }
      if (action === "toggleSender") {
        // Captions can only be hidden together with the sender.
        const hideSender = !pending.hideSender;
        return setPendingForward(conversation.id, { ...pending, hideSender, hideCaptions: hideSender && pending.hideCaptions });
      }
      setPendingForward(conversation.id, { ...pending, hideCaptions: !pending.hideCaptions });
    },
    [conversation.id],
  );

  // Optimistic bubbles (the comment first, then the copies), replaced by the
  // server's messages through the tempId dedupe; failed ones can be retried.
  const sendForward = useCallback(
    async (rawComment: string) => {
      const pending = useRealtimeStore.getState().pendingForwards[conversation.id];
      if (!pending) return;
      setPendingForward(conversation.id, null);
      const comment = rawComment.trim();
      const hideCaptions = pending.hideSender && pending.hideCaptions;
      const base = {
        conversationId: conversation.id,
        meta: null,
        media: null,
        location: null,
        sender: currentUser,
        replyTo: null,
        status: "sending" as const,
      };
      const now = Date.now();
      const optimistic: ChatMessage[] = [];
      if (comment) {
        const id = tempId();
        optimistic.push({ ...base, id, tempId: id, type: "TEXT", content: comment, createdAt: new Date(now).toISOString() });
      }
      for (const source of pending.messages) {
        const id = tempId();
        const captioned = ["IMAGE", "VIDEO", "FILE"].includes(source.type);
        forwardRetries.current.set(id, {
          sourceConversationId: pending.sourceConversationId,
          messageId: source.id,
          hideSender: pending.hideSender,
          hideCaptions,
        });
        optimistic.push({
          ...base,
          id,
          tempId: id,
          type: source.type,
          content: hideCaptions && captioned ? null : source.content,
          media: source.media,
          location: source.location,
          createdAt: new Date(now + optimistic.length).toISOString(),
          forward: pending.hideSender
            ? null
            : (source.forward ?? {
                name: source.sender.name,
                conversationId: pending.sourceConversationId,
                messageId: source.id,
                originalDate: source.createdAt,
              }),
        });
      }
      setMessages((current) => [...current, ...optimistic]);
      requestRead.current();

      const tempIds = optimistic.map((m) => m.tempId!);
      const failAll = (error?: string) => {
        const ids = new Set(tempIds);
        setMessages((current) =>
          current.map((m) => (m.tempId && ids.has(m.tempId) && m.status !== "sent" ? { ...m, status: "failed" } : m)),
        );
        if (error) toast.error(error);
      };
      try {
        const result = await forwardMessages({
          sourceConversationId: pending.sourceConversationId,
          messageIds: pending.messages.map((m) => m.id),
          targets: [{ conversationId: conversation.id }],
          comment: comment || null,
          hideSender: pending.hideSender,
          hideCaptions,
          tempIds,
        });
        const target = result.ok ? result.results[0] : null;
        if (!target?.ok) return failAll(result.ok ? target?.error : result.error);
        target.messages.forEach((message, index) =>
          setMessages((current) => mergeMessage(current, message, tempIds[index])),
        );
        for (const id of tempIds) forwardRetries.current.delete(id);
      } catch {
        failAll();
      }
    },
    [conversation.id, currentUser, requestRead],
  );

  const startEdit = useCallback((message: ChatMessage) => {
    setPendingForward(conversation.id, null); // forward, reply and edit are exclusive
    setReplyTo(null);
    setSelection(null);
    setEditing(message);
  }, [conversation.id]);

  // ArrowUp in an empty composer: my newest editable message.
  const editLast = useCallback(() => {
    const last = [...messagesRef.current].reverse().find((m) => canEditMessage(m) && !removing.has(m.id));
    if (last) startEdit(last);
  }, [canEditMessage, startEdit, removing]);

  // Optimistic: the bubble shows the new text at once (with the clock icon),
  // back to the old one with an error if the server refuses.
  const saveEdit = useCallback(
    (raw: string) => {
      const target = editingRef.current;
      if (!target) return;
      const content = raw.trim();
      if (content === (target.content ?? "")) return setEditing(null); // unchanged: nothing to save
      if (target.type === "TEXT" && content === "") {
        // A text message can't be empty: offer to delete it instead.
        setEditing(null);
        setEmptyEditPrompt(true);
        setDeleteTargets([target]);
        return;
      }
      const before = { content: target.content, editedAt: target.editedAt ?? null };
      const setSaving = (saving: boolean) =>
        setMessages((current) =>
          current.map((m) => (m.id === target.id ? { ...m, status: saving ? "sending" : "sent" } : m)),
        );
      setEditing(null);
      setMessages((current) => applyEdit(current, { messageId: target.id, content: content || null, editedAt: new Date().toISOString() }));
      setSaving(true);
      editMessage({ conversationId: conversation.id, messageId: target.id, content })
        .then((result) => {
          if (result.ok) {
            const saved = result.message;
            setMessages((current) => applyEdit(current, { messageId: target.id, content: saved.content, editedAt: saved.editedAt ?? null }));
            return setSaving(false);
          }
          setMessages((current) => applyEdit(current, { messageId: target.id, ...before }));
          setSaving(false);
          if (result.gone) removeLocally([target.id]);
          toast.error(result.error);
        })
        .catch(() => {
          setMessages((current) => applyEdit(current, { messageId: target.id, ...before }));
          setSaving(false);
          toast.error("Couldn't save the edit");
        });
    },
    [conversation.id],
  );

  const startReply = useCallback((message: ChatMessage) => {
    setPendingForward(conversation.id, null);
    setEditing(null);
    setReplyTo(message);
    composerRef.current?.focus();
  }, [conversation.id]);

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
            <div className="-me-2 flex items-center">
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Forward selected messages"
              disabled={selectedCount === 0}
              onClick={forwardSelection}
              className="size-11 rounded-full"
            >
              <Forward className="size-5.5" />
            </Button>
            {!isSaved && (
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Save selected messages"
                disabled={selectedCount === 0}
                onClick={saveSelection}
                className="size-11 rounded-full"
              >
                <Bookmark className="size-5.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Delete selected messages"
              disabled={selectedCount === 0}
              onClick={askDeleteSelection}
              className="size-11 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-5.5" />
            </Button>
            </div>
          }
        />
      ) : (
        <PageHeader
          start={<BackButton unreadExcept={chat.id} />}
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
            // Tapping the header opens the info page (Saved Messages has none).
            (() => {
              const content = (
                <>
                  <UserAvatar
                    user={other ?? { id: chat.id, name: chat.title, avatarUrl: chat.avatarUrl }}
                    size="sm"
                    saved={isSaved}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-base leading-tight">
                      {isChannel && <Megaphone aria-label="Channel" className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{chat.title}</span>
                      {chat.muted && <BellOff aria-label="Muted" className="size-3.5 shrink-0 text-muted-foreground" />}
                    </span>
                    <ChatStatus conversation={chat} currentUserId={currentUser.id} />
                  </span>
                </>
              );
              return isSaved ? (
                <div className="flex items-center gap-3">{content}</div>
              ) : (
                <Link
                  href={`/chats/${chat.id}/info`}
                  className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {content}
                </Link>
              );
            })()
          }
        />
      )}

      <MessageList
        ref={listRef}
        messages={messages}
        windowKey={windowKey}
        initialMessageId={initialMessageId}
        highlightId={highlightId}
        firstUnreadId={firstUnreadId}
        unreadAtOpen={unreadAtOpen}
        currentUserId={currentUser.id}
        conversationType={chat.type}
        channelTitle={isChannel ? chat.title : undefined}
        isAdmin={myRole === "ADMIN"}
        memberNames={memberNames}
        readStates={readStates}
        hasOlder={hasOlder}
        hasNewer={hasNewer}
        loadingOlder={loadingOlder}
        loadingNewer={loadingNewer}
        olderError={olderError}
        onLoadOlder={() => void loadOlder()}
        onLoadNewer={() => void loadNewer()}
        onJumpToLatest={() => void jumpToLatest()}
        onJumpToFirstUnread={() => void jumpToFirstUnread()}
        onJumpToMessage={(id) => void jumpTo(id)}
        onReply={startReply}
        onRetry={retry}
        onCancelUpload={cancelUpload}
        onResumeUpload={documents.resume}
        selection={selection}
        removing={removing}
        onSelect={startSelection}
        onToggleSelect={toggleSelection}
        onDelete={askDelete}
        canEditMessage={canEditMessage}
        onEdit={startEdit}
        editing={editing !== null}
        onSave={saveOne}
        onForward={forwardOne}
        onOpenForward={openForward}
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
            className="h-12 w-full gap-2 rounded-xl text-base font-semibold text-link"
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
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={saveEdit}
            onEditLast={editLast}
            forward={pendingForward}
            onSendForward={(comment) => void sendForward(comment)}
            onForwardAction={forwardAction}
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
        onOpenChange={(open) => {
          if (open) return;
          setDeleteTargets(null);
          setEmptyEditPrompt(false);
        }}
        title={
          emptyEditPrompt
            ? "Message is empty. Delete it?"
            : deleteTargets && deleteTargets.length > 1
            ? `Delete ${formatCount(deleteTargets.length, "message")}?`
            : "Delete message?"
        }
        everyoneLabel={
          everyoneAllowed ? (chat.type === "DIRECT" ? `Also delete for ${chat.title}` : "Delete for everyone") : null
        }
        alwaysEveryone={isChannel || isSaved}
        description={isChannel ? "It will be removed for every subscriber." : undefined}
        onConfirm={confirmDelete}
      />
      {conversationActions.dialog}
      <ForwardPicker
        open={forwardDraft !== null}
        onOpenChange={(open) => !open && setForwardDraft(null)}
        draft={forwardDraft}
        onPickSingle={(target) => void pickForwardTarget(target)}
        onForwarded={() => setSelection(null)}
      />
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

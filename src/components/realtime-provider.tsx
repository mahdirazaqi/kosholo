"use client";

import { useEffect } from "react";
import { formatNumber } from "@/lib/numbers";
import { playNotificationSound, unlockAudio } from "@/lib/pwa/notification-sound";
import { getSettings } from "@/lib/pwa/settings";
import { getConversation, listConversations } from "@/app/(app)/chats/actions";
import { getSocket } from "@/lib/realtime/client/socket";
import type {
  ConversationClearedPayload,
  ConversationDeletedPayload,
  ConversationReadPayload,
  ConversationRemovedPayload,
  ConversationUpdatedPayload,
  MessageDeletedPayload,
  MessageNewPayload,
  TypingPayload,
  UserUpdatedPayload,
} from "@/lib/realtime/events";
import {
  applyMessageToList,
  hydrateConversations,
  insertConversation,
  markConversationRead,
  refreshConversationRow,
  removeConversation,
  renameConversation,
  selectTotalUnread,
  resubscribePresence,
  setAvatarOverride,
  setPresence,
  setTyping,
  useRealtimeStore,
} from "@/lib/realtime/client/store";

// Owns the socket for the signed-in app: connects on mount, disconnects on
// unmount (e.g. logout). Global listeners keep the chat list, typing and
// presence state current on every page; the open chat adds its own listeners.
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const socket = getSocket();
    let connectedOnce = false;
    let hiddenAt: number | null = null;

    const refreshList = () => {
      listConversations()
        .then((items) => hydrateConversations(items, true))
        .catch(() => {});
    };
    // The list drives the unread badge on every page, not only the chat list.
    if (useRealtimeStore.getState().conversations === null) refreshList();

    const onConnect = () => {
      useRealtimeStore.setState({ connected: true });
      resubscribePresence();
      // Anything sent while we were away is only in the DB.
      if (connectedOnce) refreshList();
      connectedOnce = true;
    };
    const onDisconnect = () => useRealtimeStore.setState({ connected: false });
    const onSession = ({ userId }: { userId: string }) => useRealtimeStore.setState({ me: userId });

    const onMessage = ({ message }: MessageNewPayload) => {
      // A message ends the sender's typing state.
      setTyping(message.conversationId, message.sender.id, null);
      const { me, activeConversationId } = useRealtimeStore.getState();
      const openAndVisible =
        activeConversationId === message.conversationId && document.visibilityState === "visible";
      // A soft chime for others' messages in conversations not on screen.
      if (message.sender.id !== me && message.type !== "SYSTEM" && !openAndVisible && getSettings().sound) {
        playNotificationSound();
      }
      if (!applyMessageToList(message)) {
        getConversation(message.conversationId)
          .then((item) => item && insertConversation(item))
          .catch(() => {});
      }
    };
    const onRead = ({ conversationId, userId }: ConversationReadPayload) => {
      // Read in another tab/device of mine.
      if (userId === useRealtimeStore.getState().me) markConversationRead(conversationId);
    };
    const onUpdated = ({ conversationId, title, avatarUrl }: ConversationUpdatedPayload) => {
      if (title !== undefined) renameConversation(conversationId, title);
      if (avatarUrl !== undefined) setAvatarOverride(conversationId, avatarUrl);
    };
    const onUserUpdated = ({ userId, avatarUrl }: UserUpdatedPayload) => {
      if (avatarUrl !== undefined) setAvatarOverride(userId, avatarUrl);
    };
    const onRemoved = ({ conversationId }: ConversationRemovedPayload) => removeConversation(conversationId);
    // Deletions change the row's preview/time/unread, or remove it.
    const onMessageDeleted = ({ conversationId }: MessageDeletedPayload) => refreshConversationRow(conversationId);
    const onCleared = ({ conversationId }: ConversationClearedPayload) => refreshConversationRow(conversationId);
    const onDeleted = ({ conversationId }: ConversationDeletedPayload) => removeConversation(conversationId);
    const onTypingStart = (payload: TypingPayload) =>
      setTyping(payload.conversationId, payload.userId, payload.name);
    const onTypingStop = (payload: TypingPayload) =>
      setTyping(payload.conversationId, payload.userId, null);

    // Mobile browsers suspend sockets in the background: when the tab comes
    // back, reconnect if needed and refresh the list.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === null) return;
      hiddenAt = null;
      if (!socket.connected) socket.connect();
      else refreshList();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("session:ready", onSession);
    socket.on("message:new", onMessage);
    socket.on("conversation:read", onRead);
    socket.on("conversation:updated", onUpdated);
    socket.on("conversation:removed", onRemoved);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("conversation:cleared", onCleared);
    socket.on("conversation:deleted", onDeleted);
    socket.on("user:updated", onUserUpdated);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", setPresence);
    document.addEventListener("visibilitychange", onVisibility);
    // Audio may only start after a user gesture.
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("session:ready", onSession);
      socket.off("message:new", onMessage);
      socket.off("conversation:read", onRead);
      socket.off("conversation:updated", onUpdated);
      socket.off("conversation:removed", onRemoved);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("conversation:cleared", onCleared);
      socket.off("conversation:deleted", onDeleted);
      socket.off("user:updated", onUserUpdated);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", setPresence);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      socket.disconnect();
      useRealtimeStore.setState({ connected: false, conversations: null, typing: {}, presence: {}, avatars: {}, me: null });
    };
  }, []);

  useUnreadIndicators();
  return children;
}

const TITLE_PREFIX = /^\([^)]*\) /;

// Total unread → "(3) …" in the title while the tab is hidden, and the
// installed app's icon badge where supported.
function useUnreadIndicators() {
  const total = useRealtimeStore(selectTotalUnread);
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, "");
      document.title =
        document.visibilityState === "hidden" && total > 0 ? `(${formatNumber(total)}) ${base}` : base;
    };
    apply();
    document.addEventListener("visibilitychange", apply);

    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (total > 0) void nav.setAppBadge?.(total).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});

    return () => document.removeEventListener("visibilitychange", apply);
  }, [total]);
}

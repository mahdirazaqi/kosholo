"use client";

import { useEffect } from "react";
import { formatNumber } from "@/lib/numbers";
import { clearBadges, updateAppBadge, updateFavicon } from "@/lib/pwa/badges";
import { playNotificationSound, unlockAudio } from "@/lib/pwa/notification-sound";
import { getSettings } from "@/lib/pwa/settings";
import { getConversation, listConversations } from "@/app/(app)/chats/actions";
import { getSocket } from "@/lib/realtime/client/socket";
import type {
  ConversationClearedPayload,
  ConversationDeletedPayload,
  ConversationJoinedPayload,
  ConversationReadPayload,
  ConversationRemovedPayload,
  ConversationUpdatedPayload,
  MessageDeletedPayload,
  MessageEditedPayload,
  MessageNewPayload,
  TypingPayload,
  UserUpdatedPayload,
} from "@/lib/realtime/events";
import {
  applyEditToList,
  clearMessageCache,
  bumpPhotosVersion,
  applyMessageToList,
  countIncomingUnread,
  refreshUnreadSummary,
  hydrateConversations,
  insertConversation,
  isConversationMuted,
  markConversationRead,
  patchConversation,
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
    if (useRealtimeStore.getState().conversations === null) refreshList();
    // App start: the unread store (every badge) is loaded here, on every page.
    refreshUnreadSummary();

    const onConnect = () => {
      useRealtimeStore.setState({ connected: true });
      resubscribePresence();
      // Anything sent while we were away is only in the DB.
      if (connectedOnce) refreshList();
      connectedOnce = true;
      // Reconnect: messages may have arrived (or been read) while away.
      refreshUnreadSummary();
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
      if (
        message.sender.id !== me &&
        message.type !== "SYSTEM" &&
        !openAndVisible &&
        !isConversationMuted(message.conversationId) &&
        getSettings().sound
      ) {
        playNotificationSound();
      }
      countIncomingUnread(message);
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
    const onUpdated = ({ conversationId, title, avatarUrl, muted, myRole }: ConversationUpdatedPayload) => {
      if (title !== undefined) renameConversation(conversationId, title);
      if (avatarUrl !== undefined) setAvatarOverride(conversationId, avatarUrl);
      if (muted !== undefined) patchConversation(conversationId, { muted });
      if (myRole !== undefined) patchConversation(conversationId, { myRole });
    };
    // Added to a channel, or joined through its invite link: no system message,
    // the row is fetched and inserted.
    const onJoined = ({ conversationId }: ConversationJoinedPayload) => {
      getConversation(conversationId)
        .then((item) => item && insertConversation(item))
        .catch(() => {});
    };
    // Chat-list preview only: no reordering, no unread change, no sound.
    const onEdited = ({ conversationId, messageId, content }: MessageEditedPayload) =>
      applyEditToList(conversationId, messageId, content);
    const onUserUpdated = ({ userId, avatarUrl, photosVersion }: UserUpdatedPayload) => {
      if (avatarUrl !== undefined) setAvatarOverride(userId, avatarUrl);
      if (photosVersion !== undefined) bumpPhotosVersion(userId, photosVersion);
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
      refreshUnreadSummary(); // visible again: the server wins
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
    socket.on("conversation:joined", onJoined);
    socket.on("conversation:removed", onRemoved);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("conversation:cleared", onCleared);
    socket.on("conversation:deleted", onDeleted);
    socket.on("message:edited", onEdited);
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
      socket.off("conversation:joined", onJoined);
      socket.off("conversation:removed", onRemoved);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("conversation:cleared", onCleared);
      socket.off("conversation:deleted", onDeleted);
      socket.off("message:edited", onEdited);
      socket.off("user:updated", onUserUpdated);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", setPresence);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      socket.disconnect();
      clearBadges();
      clearMessageCache();
      useRealtimeStore.setState({ connected: false, conversations: null, unread: null, pendingForwards: {}, photosVersions: {}, typing: {}, presence: {}, avatars: {}, me: null });
    };
  }, []);

  useUnreadIndicators();
  return children;
}

const TITLE_PREFIX = /^\([^)]*\) /;

// The unread total (from the one store) → "(3) …" in the tab title, the
// favicon and the installed app's icon, whatever the tab's visibility.
function useUnreadIndicators() {
  const total = useRealtimeStore(selectTotalUnread);
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, "");
      const next = total > 0 ? `(${formatNumber(total)}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Page navigations set a new title: put the prefix back.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });

    updateAppBadge(total);
    updateFavicon(total);
    return () => observer.disconnect();
  }, [total]);
}

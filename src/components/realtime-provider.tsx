"use client";

import { useEffect } from "react";
import { getConversation, listConversations } from "@/app/(app)/chats/actions";
import { getSocket } from "@/lib/realtime/client/socket";
import type {
  ConversationReadPayload,
  ConversationRemovedPayload,
  ConversationUpdatedPayload,
  MessageNewPayload,
  TypingPayload,
} from "@/lib/realtime/events";
import {
  applyMessageToList,
  hydrateConversations,
  insertConversation,
  markConversationRead,
  removeConversation,
  renameConversation,
  resubscribePresence,
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
      if (useRealtimeStore.getState().conversations === null) return;
      listConversations()
        .then((items) => hydrateConversations(items, true))
        .catch(() => {});
    };

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
    const onUpdated = ({ conversationId, title }: ConversationUpdatedPayload) => {
      if (title !== undefined) renameConversation(conversationId, title);
    };
    const onRemoved = ({ conversationId }: ConversationRemovedPayload) => removeConversation(conversationId);
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
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", setPresence);
    document.addEventListener("visibilitychange", onVisibility);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("session:ready", onSession);
      socket.off("message:new", onMessage);
      socket.off("conversation:read", onRead);
      socket.off("conversation:updated", onUpdated);
      socket.off("conversation:removed", onRemoved);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", setPresence);
      document.removeEventListener("visibilitychange", onVisibility);
      socket.disconnect();
      useRealtimeStore.setState({ connected: false, conversations: null, typing: {}, presence: {}, me: null });
    };
  }, []);

  return children;
}

"use client";

import { useEffect, useRef } from "react";
import { getMessagesSince, markAsRead } from "@/app/(app)/chats/actions";
import { getSocket } from "@/lib/realtime/client/socket";
import {
  markConversationRead,
  setActiveConversation,
  useRealtimeStore,
} from "@/lib/realtime/client/store";
import type {
  ConversationReadPayload,
  ConversationRemovedPayload,
  ConversationUpdatedPayload,
  MessageNewPayload,
} from "@/lib/realtime/events";
import type { ChatMessage, ConversationRemovedReason } from "@/lib/types/chat";

const READ_THROTTLE_MS = 2000;

type Options = {
  conversationId: string;
  onMessage: (message: ChatMessage, tempId: string | null) => void;
  onRead: (userId: string, lastReadAt: string) => void;
  onUpdated: (payload: ConversationUpdatedPayload) => void;
  // I'm no longer a member (removed / left elsewhere / group deleted).
  onRemoved: (reason: ConversationRemovedReason) => void;
  // Newest server-confirmed createdAt currently shown, for catch-up.
  getLastConfirmedAt: () => string | null;
};

// Everything the open chat needs from the socket:
// - joins conv:{id} (and re-joins after reconnects),
// - delivers message:new / conversation:read for this conversation,
// - catches up on missed messages after a reconnect or when the tab is visible again,
// - marks the conversation read (throttled, only while the tab is visible).
// Returns `requestRead` for callers to signal "the user has seen new messages".
export function useConversationRealtime({
  conversationId,
  onMessage,
  onRead,
  onUpdated,
  onRemoved,
  getLastConfirmedAt,
}: Options) {
  // Latest callbacks without re-subscribing on every render.
  const callbacks = useRef({ onMessage, onRead, onUpdated, onRemoved, getLastConfirmedAt });
  useEffect(() => {
    callbacks.current = { onMessage, onRead, onUpdated, onRemoved, getLastConfirmedAt };
  });
  const removed = useRef(false);

  const readState = useRef({ last: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const requestRead = useRef(() => {});

  useEffect(() => {
    const socket = getSocket();
    const read = readState.current;

    const sendRead = () => {
      if (removed.current) return;
      read.last = Date.now();
      read.timer = null;
      markConversationRead(conversationId);
      void markAsRead(conversationId).catch(() => {});
    };
    // At most once every 2s (leading + trailing), and only while visible.
    requestRead.current = () => {
      if (document.visibilityState !== "visible" || read.timer) return;
      const wait = read.last + READ_THROTTLE_MS - Date.now();
      if (wait <= 0) sendRead();
      else read.timer = setTimeout(sendRead, wait);
    };

    const join = () => socket.emit("conversation:join", conversationId, () => {});

    const catchUp = async () => {
      const since = callbacks.current.getLastConfirmedAt();
      if (!since) return;
      try {
        const result = await getMessagesSince(conversationId, since);
        if (!result) {
          // No longer a member (e.g. removed while offline).
          if (!removed.current) {
            removed.current = true;
            callbacks.current.onRemoved("removed");
          }
          return;
        }
        for (const message of result.messages) callbacks.current.onMessage(message, null);
        for (const state of result.readStates) {
          if (state.lastReadAt) callbacks.current.onRead(state.userId, state.lastReadAt);
        }
      } catch {
        // Next reconnect/visibility change retries.
      }
    };

    const onConnect = () => {
      if (removed.current) return;
      join();
      void catchUp();
    };
    const onMessage = ({ message, tempId }: MessageNewPayload) => {
      if (message.conversationId !== conversationId) return;
      callbacks.current.onMessage(message, tempId);
      if (message.sender.id !== useRealtimeStore.getState().me) requestRead.current();
    };
    const onRead = ({ conversationId: id, userId, lastReadAt }: ConversationReadPayload) => {
      if (id === conversationId) callbacks.current.onRead(userId, lastReadAt);
    };
    const onUpdated = (payload: ConversationUpdatedPayload) => {
      if (payload.conversationId === conversationId) callbacks.current.onUpdated(payload);
    };
    const onRemoved = ({ conversationId: id, reason }: ConversationRemovedPayload) => {
      if (id !== conversationId) return;
      removed.current = true;
      callbacks.current.onRemoved(reason);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || removed.current) return;
      setActiveConversation(conversationId);
      void catchUp();
      requestRead.current();
    };

    setActiveConversation(conversationId);
    socket.on("connect", onConnect);
    socket.on("message:new", onMessage);
    socket.on("conversation:read", onRead);
    socket.on("conversation:updated", onUpdated);
    socket.on("conversation:removed", onRemoved);
    document.addEventListener("visibilitychange", onVisibility);
    if (socket.connected) join();
    requestRead.current();

    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onMessage);
      socket.off("conversation:read", onRead);
      socket.off("conversation:updated", onUpdated);
      socket.off("conversation:removed", onRemoved);
      document.removeEventListener("visibilitychange", onVisibility);
      if (read.timer) clearTimeout(read.timer);
      if (socket.connected) socket.emit("conversation:leave", conversationId);
      if (useRealtimeStore.getState().activeConversationId === conversationId) {
        setActiveConversation(null);
      }
    };
  }, [conversationId]);

  return requestRead;
}

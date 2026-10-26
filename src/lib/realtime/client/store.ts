"use client";

import { create } from "zustand";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_EXPIRE_MS, type PresenceState } from "@/lib/realtime/events";
import type { ChatMessage, ConversationListItem } from "@/lib/types/chat";

// Client realtime state. Only mutated from effects/event handlers, never during
// render, so the module-level store stays empty on the server.
type RealtimeState = {
  me: string | null;
  connected: boolean;
  // Chat list; null until the list page has loaded it once.
  conversations: ConversationListItem[] | null;
  // The conversation open on screen (unread counts don't grow for it).
  activeConversationId: string | null;
  // conversationId → userId → display name
  typing: Record<string, Record<string, string>>;
  presence: Record<string, PresenceState>;
};

export const useRealtimeStore = create<RealtimeState>(() => ({
  me: null,
  connected: false,
  conversations: null,
  activeConversationId: null,
  typing: {},
  presence: {},
}));

const set = useRealtimeStore.setState;
const get = useRealtimeStore.getState;

const sortByRecent = (items: ConversationListItem[]) =>
  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

// ---- Chat list ----

// Merge server data into the list. `authoritative` (a fresh fetch) replaces
// the list; otherwise a row the client has seen newer activity for is kept
// (server props can come from a stale router cache).
export function hydrateConversations(items: ConversationListItem[], authoritative = false) {
  const current = get().conversations;
  if (authoritative || !current) {
    set({ conversations: sortByRecent([...items]) });
    return;
  }
  const byId = new Map(current.map((item) => [item.id, item]));
  const merged = items.map((item) => {
    const known = byId.get(item.id);
    return known && (known.lastMessageAt ?? "") > (item.lastMessageAt ?? "") ? known : item;
  });
  for (const item of current) if (!merged.some((m) => m.id === item.id)) merged.push(item);
  set({ conversations: sortByRecent(merged) });
}

const appliedMessageIds = new Set<string>();

// Returns false when the conversation is not in the list yet (caller fetches it).
export function applyMessageToList(message: ChatMessage): boolean {
  const { conversations, me, activeConversationId } = get();
  if (!conversations) return true;
  if (appliedMessageIds.has(message.id)) return true;

  const index = conversations.findIndex((item) => item.id === message.conversationId);
  if (index === -1) return false;

  appliedMessageIds.add(message.id);
  if (appliedMessageIds.size > 1000) appliedMessageIds.clear();

  const isMine = message.sender.id === me;
  const isOpen =
    activeConversationId === message.conversationId && document.visibilityState === "visible";
  const item = conversations[index];
  const updated: ConversationListItem = {
    ...item,
    lastMessage: {
      type: message.type,
      content: message.content?.slice(0, PREVIEW_LENGTH) ?? null,
      isMine,
    },
    lastMessageAt: message.createdAt,
    unreadCount: isMine || isOpen ? item.unreadCount : item.unreadCount + 1,
  };
  set({ conversations: [updated, ...conversations.filter((_, i) => i !== index)] });
  return true;
}

export function insertConversation(item: ConversationListItem) {
  const conversations = get().conversations;
  if (!conversations || conversations.some((c) => c.id === item.id)) return;
  set({ conversations: sortByRecent([item, ...conversations]) });
}

export function markConversationRead(conversationId: string) {
  const conversations = get().conversations;
  if (!conversations) return;
  set({
    conversations: conversations.map((item) =>
      item.id === conversationId && item.unreadCount ? { ...item, unreadCount: 0 } : item,
    ),
  });
}

export function setActiveConversation(conversationId: string | null) {
  set({ activeConversationId: conversationId });
}

// ---- Typing ----

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setTyping(conversationId: string, userId: string, name: string | null) {
  const key = `${conversationId}:${userId}`;
  const timer = typingTimers.get(key);
  if (timer) clearTimeout(timer);
  typingTimers.delete(key);

  const typing = { ...get().typing };
  const users = { ...typing[conversationId] };
  if (name === null) delete users[userId];
  else {
    users[userId] = name;
    // Expire if no new typing:start arrives in time.
    typingTimers.set(key, setTimeout(() => setTyping(conversationId, userId, null), TYPING_EXPIRE_MS));
  }
  if (Object.keys(users).length) typing[conversationId] = users;
  else delete typing[conversationId];
  set({ typing });
}

// ---- Presence ----

const presenceRefs = new Map<string, number>();

function requestPresence(userIds: string[]) {
  const socket = getSocket();
  if (!userIds.length || !socket.connected) return;
  socket.emit("presence:subscribe", { userIds }, (states) => {
    const presence = { ...get().presence };
    for (const state of states) presence[state.userId] = state;
    set({ presence });
  });
}

export function subscribePresence(userIds: string[]) {
  const fresh = userIds.filter((id) => {
    const count = presenceRefs.get(id) ?? 0;
    presenceRefs.set(id, count + 1);
    return count === 0;
  });
  requestPresence(fresh);
  return () => {
    const released = userIds.filter((id) => {
      const count = (presenceRefs.get(id) ?? 1) - 1;
      if (count > 0) presenceRefs.set(id, count);
      else presenceRefs.delete(id);
      return count <= 0;
    });
    if (released.length && getSocket().connected) {
      getSocket().emit("presence:unsubscribe", { userIds: released });
    }
  };
}

// After a (re)connect the server has forgotten our presence rooms.
export function resubscribePresence() {
  requestPresence([...presenceRefs.keys()]);
}

export function setPresence(state: PresenceState) {
  set({ presence: { ...get().presence, [state.userId]: state } });
}

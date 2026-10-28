"use client";

import { create } from "zustand";
import { getConversation, getUnread } from "@/app/(app)/chats/actions";
import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import { getSocket } from "@/lib/realtime/client/socket";
import { TYPING_EXPIRE_MS, type PresenceState } from "@/lib/realtime/events";
import type { ChatMessage, ConversationListItem, UnreadSummary } from "@/lib/types/chat";

// Messages chosen to be forwarded into one conversation's composer.
export type PendingForward = {
  sourceConversationId: string;
  messages: ChatMessage[]; // original order
  hideSender: boolean;
  hideCaptions: boolean;
};

export function setPendingForward(conversationId: string, pending: PendingForward | null) {
  const pendingForwards = { ...get().pendingForwards };
  if (pending) pendingForwards[conversationId] = pending;
  else delete pendingForwards[conversationId];
  set({ pendingForwards });
}

// Client realtime state. Only mutated from effects/event handlers, never during
// render, so the module-level store stays empty on the server.
type RealtimeState = {
  me: string | null;
  connected: boolean;
  // Chat list; null until the list page has loaded it once.
  conversations: ConversationListItem[] | null;
  // Unread counts: THE single source for every badge (chat rows, nav tabs,
  // back button, tab title, favicon, app icon). Null until the first server
  // summary arrives. Server wins: setUnreadSummary replaces everything.
  unread: Record<string, { count: number; muted: boolean }> | null;
  // The conversation open on screen (unread counts don't grow for it).
  activeConversationId: string | null;
  // conversationId → userId → display name
  typing: Record<string, Record<string, string>>;
  presence: Record<string, PresenceState>;
  // Forwards waiting in a conversation's composer (single-target forwarding),
  // per target conversation. Kept across navigation; lost on reload.
  pendingForwards: Record<string, PendingForward>;
  // Live photo changes, keyed by user id or group conversation id.
  avatars: Record<string, string | null>;
};

export const useRealtimeStore = create<RealtimeState>(() => ({
  me: null,
  connected: false,
  conversations: null,
  unread: null,
  activeConversationId: null,
  typing: {},
  presence: {},
  pendingForwards: {},
  avatars: {},
}));

const set = useRealtimeStore.setState;
const get = useRealtimeStore.getState;

const sortByRecent = (items: ConversationListItem[]) =>
  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

// ---- Unread (the one store every badge reads) ----

// Muted conversations keep their own count but don't add to the total.
export const selectTotalUnread = (state: RealtimeState) =>
  Object.values(state.unread ?? {}).reduce((total, entry) => total + (entry.muted ? 0 : entry.count), 0);

export const selectUnreadCount = (conversationId: string) => (state: RealtimeState) =>
  state.unread?.[conversationId]?.count ?? 0;

// Total of the other conversations (the chat page's back button).
export const selectOtherUnread = (exceptId: string | null) => (state: RealtimeState) =>
  Object.entries(state.unread ?? {}).reduce(
    (total, [id, entry]) => total + (entry.muted || id === exceptId ? 0 : entry.count),
    0,
  );

// Replace everything with the server's summary (app start, reconnect, tab
// visible again).
export function setUnreadSummary(summary: UnreadSummary) {
  set({ unread: summary.perConversation });
}

export function refreshUnreadSummary() {
  getUnread()
    .then(setUnreadSummary)
    .catch(() => {});
}

const countedMessageIds = new Set<string>();

// message:new from someone else → +1, unless that conversation is open and
// visible (the open chat marks it read instead). Idempotent per message id.
export function countIncomingUnread(message: ChatMessage) {
  const { unread, me, activeConversationId } = get();
  if (!unread || countedMessageIds.has(message.id)) return;
  countedMessageIds.add(message.id);
  if (countedMessageIds.size > 1000) countedMessageIds.clear();
  if (message.sender.id === me || message.type === "SYSTEM") return;
  if (activeConversationId === message.conversationId && document.visibilityState === "visible") return;
  const entry = unread[message.conversationId] ?? { count: 0, muted: false };
  set({ unread: { ...unread, [message.conversationId]: { ...entry, count: entry.count + 1 } } });
}

// A deletion/clear changed what's unread: ask the server for this one entry.
const unreadTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function refreshUnread(conversationId: string) {
  clearTimeout(unreadTimers.get(conversationId));
  unreadTimers.set(
    conversationId,
    setTimeout(() => {
      unreadTimers.delete(conversationId);
      getUnread(conversationId)
        .then((summary) => {
          const unread = { ...get().unread };
          const entry = summary.perConversation[conversationId];
          if (entry) unread[conversationId] = entry;
          else delete unread[conversationId];
          set({ unread });
        })
        .catch(() => {});
    }, 150),
  );
}

function dropUnread(conversationId: string) {
  const unread = get().unread;
  if (!unread || !(conversationId in unread)) return;
  const next = { ...unread };
  delete next[conversationId];
  set({ unread: next });
}

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
  const { conversations, me } = get();
  if (!conversations) return true;
  if (appliedMessageIds.has(message.id)) return true;

  const index = conversations.findIndex((item) => item.id === message.conversationId);
  if (index === -1) return false;

  appliedMessageIds.add(message.id);
  if (appliedMessageIds.size > 1000) appliedMessageIds.clear();

  const isMine = message.sender.id === me;
  const item = conversations[index];
  const updated: ConversationListItem = {
    ...item,
    lastMessage: {
      id: message.id,
      type: message.type,
      duration: message.media?.duration ?? null,
      content: message.content?.slice(0, PREVIEW_LENGTH) ?? null,
      isMine,
      senderName: message.sender.name,
      meta: message.meta,
      fileName: message.media?.originalName ?? null,
      locationLabel: message.location?.label ?? null,
    },
    lastMessageAt: message.createdAt,
  };
  set({ conversations: [updated, ...conversations.filter((_, i) => i !== index)] });
  return true;
}

// An edited message that is the row's last message updates the preview text
// only (no reordering, no unread change).
export function applyEditToList(conversationId: string, messageId: string, content: string | null) {
  const conversations = get().conversations;
  if (!conversations) return;
  set({
    conversations: conversations.map((item) =>
      item.id === conversationId && item.lastMessage?.id === messageId
        ? { ...item, lastMessage: { ...item.lastMessage, content: content?.slice(0, PREVIEW_LENGTH) ?? null } }
        : item,
    ),
  });
}

export function insertConversation(item: ConversationListItem) {
  const conversations = get().conversations;
  if (!conversations || conversations.some((c) => c.id === item.id)) return;
  set({ conversations: sortByRecent([item, ...conversations]) });
}

// I read it (this tab, or another tab/device via conversation:read): 0.
export function markConversationRead(conversationId: string) {
  const unread = get().unread;
  if (!unread?.[conversationId]?.count) return;
  set({ unread: { ...unread, [conversationId]: { ...unread[conversationId], count: 0 } } });
}

export function renameConversation(conversationId: string, title: string) {
  const conversations = get().conversations;
  if (!conversations) return;
  set({
    conversations: conversations.map((item) =>
      item.id === conversationId && item.type !== "DIRECT" ? { ...item, title } : item,
    ),
  });
}

// Live changes to one row's own fields (mute switch, my role in a channel).
export function patchConversation(
  conversationId: string,
  patch: Partial<Pick<ConversationListItem, "muted" | "myRole">>,
) {
  const { conversations, unread } = get();
  // Muting moves the conversation in or out of the total.
  if (patch.muted !== undefined && unread?.[conversationId]) {
    set({ unread: { ...unread, [conversationId]: { ...unread[conversationId], muted: patch.muted } } });
  }
  if (!conversations) return;
  set({
    conversations: conversations.map((item) => (item.id === conversationId ? { ...item, ...patch } : item)),
  });
}

export const isConversationMuted = (conversationId: string) =>
  get().conversations?.find((item) => item.id === conversationId)?.muted ?? false;

// Replaces a row (or inserts it), keeping the list sorted.
export function upsertConversation(item: ConversationListItem) {
  const conversations = get().conversations;
  if (!conversations) return;
  set({ conversations: sortByRecent([item, ...conversations.filter((c) => c.id !== item.id)]) });
}

// After deletions the row's preview, time and unread count are recomputed on
// the server (nothing derived is stored). No visible message left → no row.
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function refreshConversationRow(conversationId: string) {
  clearTimeout(refreshTimers.get(conversationId));
  refreshTimers.set(
    conversationId,
    setTimeout(() => {
      refreshTimers.delete(conversationId);
      getConversation(conversationId)
        .then((item) => (item ? upsertConversation(item) : removeConversation(conversationId)))
        .catch(() => {});
      refreshUnread(conversationId);
    }, 150),
  );
}

// Conversations this tab is deleting or leaving itself: their
// conversation:deleted / removed events don't need a toast here.
const localDeletes = new Set<string>();
export function markLocalDelete(conversationId: string) {
  localDeletes.add(conversationId);
  setTimeout(() => localDeletes.delete(conversationId), 30_000);
}
export const isLocalDelete = (conversationId: string) => localDeletes.has(conversationId);

export function removeConversation(conversationId: string) {
  dropUnread(conversationId);
  const conversations = get().conversations;
  if (conversations) set({ conversations: conversations.filter((item) => item.id !== conversationId) });
  setTypingFor(conversationId, null);
}

function setTypingFor(conversationId: string, users: Record<string, string> | null) {
  const typing = { ...get().typing };
  if (users) typing[conversationId] = users;
  else delete typing[conversationId];
  set({ typing });
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

// ---- Avatars (user and group photos) ----

export function setAvatarOverride(id: string, avatarUrl: string | null) {
  set({ avatars: { ...get().avatars, [id]: avatarUrl } });
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

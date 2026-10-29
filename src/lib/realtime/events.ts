// Socket.IO contract shared by the client and the server. Every event name and
// payload lives here; both sides use Socket.IO's typed-event generics.
import type { ChatMember, ChatMessage, ConversationRemovedReason, MemberRole } from "@/lib/types/chat";

// ---- Rooms ----
// user:{id}      every socket of a user (all tabs/devices). Per-user delivery.
// conv:{id}      sockets that have a conversation open (joined on the chat page).
// presence:{id}  sockets watching a user's online status.
export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conv:${conversationId}`;
export const presenceRoom = (userId: string) => `presence:${userId}`;

// ---- Payloads ----
export type MessageNewPayload = {
  message: ChatMessage;
  tempId: string | null; // the sender's optimistic id, for merging
};

export type ConversationReadPayload = {
  conversationId: string;
  userId: string;
  lastReadAt: string; // ISO
};

export type TypingPayload = {
  conversationId: string;
  userId: string;
  name: string;
};

// After rename / membership / role changes. Fields present are the new values.
export type ConversationUpdatedPayload = {
  conversationId: string;
  title?: string;
  avatarUrl?: string | null; // group photo ("/api/media/{id}") or removed
  members?: ChatMember[]; // full current member list (groups; never in channels)
  description?: string | null;
  // Channels: only the fields below that concern the receiver go to them, and
  // the member list or invite token are never part of an event to subscribers.
  signMessages?: boolean;
  memberCount?: number; // admins only
  membersChanged?: boolean; // admins only: refetch the subscriber/admin lists
  myRole?: MemberRole; // to the user whose role changed
  isOwner?: boolean; // to the users whose ownership changed
  muted?: boolean; // to my own tabs/devices
};

// To a user's own rooms when they joined or were added to a conversation
// (a channel): the client fetches the chat-list row.
export type ConversationJoinedPayload = {
  conversationId: string;
};

// A user's public profile changed (name / photo).
export type UserUpdatedPayload = {
  userId: string;
  name?: string;
  avatarUrl?: string | null;
  // Profile photos changed: clients showing that user's gallery refetch it.
  photosVersion?: number;
  // Appearance settings changed: only ever sent to the user's own rooms (other devices).
  appearance?: { theme: string; wallpaper: string; textSize: number };
};

// To a user who is no longer a member (removed, left, or the group was deleted).
export type ConversationRemovedPayload = {
  conversationId: string;
  reason: ConversationRemovedReason;
};

// Messages hard-deleted for everyone, or hidden "for me" (then only to my
// own tabs/devices).
export type MessageDeletedPayload = {
  conversationId: string;
  messageIds: string[];
};

// History cleared: every message created at or before `before` is gone for
// the receiver (for me: my tabs only; for everyone: every member).
export type ConversationClearedPayload = {
  conversationId: string;
  forEveryone: boolean;
  before: string; // ISO
};

// The conversation was hard-deleted (DIRECT "delete for everyone", or a
// DIRECT chat both members had cleared).
export type ConversationDeletedPayload = {
  conversationId: string;
};

export type PresenceState = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null; // ISO; null if never seen
};

// A message's text/caption was edited in place. Carries no author identity, so
// the same payload is safe for channel subscribers.
export type MessageEditedPayload = {
  conversationId: string;
  messageId: string;
  content: string | null;
  editedAt: string; // ISO
};

export type JoinResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" };

// ---- Events ----
export interface ServerToClientEvents {
  // Sent once after the handshake is authenticated.
  "session:ready": (payload: { userId: string }) => void;
  // To user:{memberId} of every member, including the sender.
  "message:new": (payload: MessageNewPayload) => void;
  // To user:{memberId} of every member.
  "conversation:read": (payload: ConversationReadPayload) => void;
  // To user:{memberId} of every member.
  "conversation:updated": (payload: ConversationUpdatedPayload) => void;
  // To everyone who shares a conversation with the user or has them as a contact.
  "user:updated": (payload: UserUpdatedPayload) => void;
  // To user:{id} of someone who just joined or was added (no system message).
  "conversation:joined": (payload: ConversationJoinedPayload) => void;
  // To user:{id} of a former member only.
  "conversation:removed": (payload: ConversationRemovedPayload) => void;
  // To user:{id} of every member who can still see the message (incl. the editor's other tabs).
  "message:edited": (payload: MessageEditedPayload) => void;
  // For everyone: to user:{memberId} of every member. For me: to my user room.
  "message:deleted": (payload: MessageDeletedPayload) => void;
  // To the user rooms of the affected users (me, or every member).
  "conversation:cleared": (payload: ConversationClearedPayload) => void;
  // To user:{id} of every former member; their sockets leave conv:{id}.
  "conversation:deleted": (payload: ConversationDeletedPayload) => void;
  // To user:{memberId} of every member except the typist (channels: other admins only).
  "typing:start": (payload: TypingPayload) => void;
  "typing:stop": (payload: TypingPayload) => void;
  // To presence:{userId}.
  "presence:update": (payload: PresenceState) => void;
}

export interface ClientToServerEvents {
  "conversation:join": (conversationId: string, ack: (result: JoinResult) => void) => void;
  "conversation:leave": (conversationId: string) => void;
  "typing:start": (conversationId: string) => void;
  "typing:stop": (conversationId: string) => void;
  "presence:subscribe": (
    payload: { userIds: string[] },
    ack: (states: PresenceState[]) => void,
  ) => void;
  "presence:unsubscribe": (payload: { userIds: string[] }) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  userId: string;
  name: string;
}

// Timing shared by both sides.
export const TYPING_CLIENT_THROTTLE_MS = 3000; // client re-sends typing:start at most this often
export const TYPING_EXPIRE_MS = 5000; // client drops a typing state after this much silence
export const TYPING_SERVER_MIN_INTERVAL_MS = 1000; // server ignores faster typing events
export const PRESENCE_GRACE_MS = 5000; // offline only after this long without sockets

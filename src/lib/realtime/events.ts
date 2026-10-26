// Socket.IO contract shared by the client and the server. Every event name and
// payload lives here; both sides use Socket.IO's typed-event generics.
import type { ChatMessage } from "@/lib/types/chat";

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

export type PresenceState = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null; // ISO; null if never seen
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
  // To user:{memberId} of every member except the typist.
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

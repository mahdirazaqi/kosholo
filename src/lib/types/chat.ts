import type { ConversationType, MessageType } from "@/generated/prisma/enums";
import type { PublicUser } from "@/lib/users";

export type { ConversationType, MessageType };

export type MessageStatus = "sending" | "sent" | "failed";

// Quoted message shown inside a reply. "deleted" means the message was a
// reply but the original is no longer available.
export type ReplyPreview = {
  id: string;
  type: MessageType;
  content: string | null; // first 100 chars
  senderName: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null; // for IMAGE/VIDEO/VOICE (later phases)
  createdAt: string; // ISO string, safe to send over RSC, actions and sockets
  sender: PublicUser;
  replyTo: ReplyPreview | null | "deleted";
  // Client-only:
  status: MessageStatus;
  tempId?: string; // id of the optimistic message this one replaced
};

export type MessagesPage = {
  messages: ChatMessage[]; // oldest → newest
  nextCursor: string | null; // id of the oldest message, when more exist
};

export type LastMessagePreview = {
  type: MessageType;
  content: string | null; // first 100 chars
  isMine: boolean;
};

export type ConversationListItem = {
  id: string;
  type: ConversationType;
  title: string; // the other user's name for DIRECT
  avatarUrl: string | null;
  otherUser: PublicUser | null; // DIRECT only
  lastMessage: LastMessagePreview | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

// What the chat screen needs to render its header and bubbles.
export type ChatConversation = {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  otherUser: PublicUser | null; // DIRECT only
  memberCount: number;
};

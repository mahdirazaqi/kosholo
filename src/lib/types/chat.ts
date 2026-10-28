import type { ConversationType, MemberRole, MessageType, UploadKind } from "@/generated/prisma/enums";
import type { PublicUser } from "@/lib/users";

export type { ConversationType, MemberRole, MessageType, UploadKind };

export type MessageStatus = "sending" | "sent" | "failed";

// Structured group event stored in Message.meta for type SYSTEM. Names are
// stored too, so the text still renders for people who have left.
export type SystemEvent =
  | "created"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "renamed"
  | "admin_promoted"
  | "admin_demoted"
  | "photo_changed"
  | "history_cleared";

export type SystemMeta = {
  event: SystemEvent;
  actorId: string;
  actorName: string;
  targetIds?: string[];
  targetNames?: string[];
  newTitle?: string; // "created" and "renamed"
  auto?: boolean; // "admin_promoted" when the last admin left
  removed?: boolean; // "photo_changed" when the photo was removed
};

// Quoted message shown inside a reply. "deleted" means the message was a
// reply but the original is no longer available.
export type ReplyPreview = {
  id: string;
  type: MessageType;
  content: string | null; // first 100 chars
  senderName: string;
  thumbUrl: string | null; // image/video
  duration: number | null; // voice/video, seconds
};

// A processed upload as the client sees it. URLs go through /api/media, which
// checks access; files are never served statically.
export type ChatMedia = {
  id: string;
  kind: UploadKind;
  url: string; // /api/media/{id}
  thumbUrl: string | null; // /api/media/{id}/thumb (image/video poster, avatar 128px)
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null; // seconds
  placeholder: string | null; // tiny blurred data URL
  waveform: number[] | null; // voice: ~48 values 0–1
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string | null;
  media: ChatMedia | null; // IMAGE / VIDEO / VOICE (content is then an optional caption)
  meta: SystemMeta | null; // SYSTEM only
  createdAt: string; // ISO string, safe to send over RSC, actions and sockets
  sender: PublicUser;
  replyTo: ReplyPreview | null | "deleted";
  // Client-only:
  status: MessageStatus;
  tempId?: string; // id of the optimistic message this one replaced
  local?: LocalUpload; // optimistic media message still uploading
};

export type LocalUpload = {
  phase: "uploading" | "processing";
  progress: number; // 0–1 of the request body
};

export type MessagesPage = {
  messages: ChatMessage[]; // oldest → newest
  nextCursor: string | null; // id of the oldest message, when more exist
};

export type LastMessagePreview = {
  type: MessageType;
  duration: number | null; // voice
  content: string | null; // first 100 chars
  isMine: boolean;
  senderName: string; // shown as "Jane: …" in group rows
  meta: SystemMeta | null;
};

export type ConversationListItem = {
  id: string;
  type: ConversationType;
  myRole: MemberRole; // the viewer's role (admin-only actions)
  title: string; // the other user's name for DIRECT
  avatarUrl: string | null;
  otherUser: PublicUser | null; // DIRECT only
  lastMessage: LastMessagePreview | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

// A member as seen by other members (public user shape + membership).
export type ChatMember = PublicUser & {
  role: MemberRole;
  joinedAt: string; // ISO
};

// Another member's read position, for read receipts (✓✓).
export type MemberReadState = {
  userId: string;
  lastReadAt: string | null; // ISO
  joinedAt: string; // messages before this aren't expected to be read by them
};

// What the chat screen needs to render its header and bubbles.
export type ChatConversation = {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  otherUser: PublicUser | null; // DIRECT only
  members: ChatMember[]; // everyone, including the viewer
  memberCount: number;
  readStates: MemberReadState[]; // every member except the viewer
};

// Group info page.
export type GroupInfo = {
  id: string;
  title: string;
  avatarUrl: string | null;
  createdAt: string;
  members: ChatMember[];
  myRole: MemberRole;
};

export type ConversationRemovedReason = "removed" | "left" | "deleted";

// Who a deletion applies to.
export type DeleteScope = "me" | "everyone";

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
// Channels only use created, renamed, photo_changed and history_cleared, and
// their text never names the actor (see lib/chat/system-text.ts).

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

export type ChatLocation = {
  latitude: number;
  longitude: number;
  label: string | null; // optional place name / address
};

// Quoted message shown inside a reply. "deleted" means the message was a
// reply but the original is no longer available.
export type ReplyPreview = {
  id: string;
  type: MessageType;
  content: string | null; // first 100 chars
  senderName: string;
  thumbUrl: string | null; // image/video (and FILE images)
  duration: number | null; // voice/video, seconds
  fileName: string | null; // FILE
  location: ChatLocation | null; // LOCATION (tiny map thumbnail)
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
  originalName: string | null; // FILE: sanitized original name
  size: number; // bytes
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string | null;
  media: ChatMedia | null; // IMAGE / VIDEO / VOICE / FILE (content is then an optional caption)
  location: ChatLocation | null; // LOCATION
  meta: SystemMeta | null; // SYSTEM only
  createdAt: string; // ISO string, safe to send over RSC, actions and sockets
  sender: PublicUser;
  replyTo: ReplyPreview | null | "deleted";
  // Client-only:
  status: MessageStatus;
  tempId?: string; // id of the optimistic message this one replaced
  local?: LocalUpload; // optimistic media message still uploading
  // CHANNEL posts: the admin's display name when the channel signs posts
  // (members never get an id or username), and the view count.
  signature?: string;
  views?: number;
  // ISO time of the last edit; null/absent = never edited.
  editedAt?: string | null;
  // Saved copies only: a snapshot of where the message came from. Independent of
  // the original (it stays if the original is edited or deleted).
  forward?: ForwardInfo | null;
};

export type ForwardInfo = {
  name: string; // sender (or channel title, plus the signature if the channel signs)
  conversationId: string | null; // null once the original conversation is gone
  messageId: string | null; // null once the original message is gone
  originalDate: string; // ISO
};

export type LocalUpload = {
  // waiting: offline / retrying a chunk; paused: a resumable FILE upload that
  // stopped (e.g. the page reloaded) and needs the file picked again.
  phase: "uploading" | "processing" | "waiting" | "paused";
  progress: number; // 0–1 of the file
  sent?: number; // bytes (FILE)
  total?: number; // bytes (FILE)
};

export type MessagesPage = {
  messages: ChatMessage[]; // oldest → newest
  hasOlder: boolean; // more messages before the first one
  hasNewer: boolean; // more messages after the last one (the page isn't the latest)
};

export type LastMessagePreview = {
  id: string; // so an edit of the last message can update the preview
  type: MessageType;
  duration: number | null; // voice
  content: string | null; // first 100 chars
  isMine: boolean;
  senderName: string; // shown as "Jane: …" in group rows
  meta: SystemMeta | null;
  fileName: string | null; // FILE
  locationLabel: string | null; // LOCATION
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
  muted: boolean; // no sound, not counted in the unread totals
};

// Unread counts live in their own store entry (never on list rows): see
// lib/chat/unread.ts for the rule and lib/realtime/client/store.ts.
export type UnreadSummary = {
  total: number; // excludes muted conversations
  perConversation: Record<string, { count: number; muted: boolean }>;
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
  // GROUP/DIRECT: everyone, including the viewer. CHANNEL: always empty
  // (the member list is admin-only and served by listChannelMembers).
  members: ChatMember[];
  memberCount: number;
  readStates: MemberReadState[]; // every member except the viewer (empty in channels)
  myRole: MemberRole;
  lastReadAt: string | null; // mine when the chat was opened: where "unread" starts
  editWindowHours: number; // DIRECT/GROUP messages can be edited this long after sending
  loadedAt: string; // server time of this load: where edit sync starts
  isOwner: boolean; // CHANNEL only
  muted: boolean;
  description: string | null; // GROUP/CHANNEL
  signMessages: boolean; // CHANNEL
};

// A channel member as an admin sees them.
export type ChannelMember = ChatMember & { isOwner: boolean };

// Channel info page. `members` is the first page of subscribers (admins only);
// `admins`, `inviteToken` and `members` are empty/null for plain members.
export type ChannelInfo = {
  id: string;
  title: string;
  avatarUrl: string | null;
  description: string | null;
  createdAt: string;
  memberCount: number;
  signMessages: boolean;
  muted: boolean;
  myRole: MemberRole;
  isOwner: boolean;
  inviteToken: string | null;
  admins: ChannelMember[];
};

export type ChannelMembersPage = { members: ChannelMember[]; nextCursor: string | null };

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

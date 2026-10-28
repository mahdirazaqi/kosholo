import type { ChatMessage } from "@/lib/types/chat";

// What a channel's subscribers (non-admins) may know about a post's author:
// the channel itself, never a user id. Client-safe and pure, so the server can
// build one payload per audience (admins get the real sender).

export type ChannelIdentity = {
  id: string; // the conversation id
  title: string;
  avatarUrl: string | null;
  signMessages: boolean;
};

// The subscriber version of a post (or system message) built for admins.
// `sender.id` is the conversation id, so it never matches a user, and the
// avatar override store resolves it to the channel photo. The posting admin's
// display name only appears as `signature`, and only when the channel signs.
export function toMemberView(message: ChatMessage, channel: ChannelIdentity): ChatMessage {
  const sender = { id: channel.id, name: channel.title, username: "", avatarUrl: channel.avatarUrl };
  return {
    ...message,
    sender,
    signature: channel.signMessages && message.type !== "SYSTEM" ? message.sender.name : undefined,
    meta: message.meta ? { event: message.meta.event, actorId: channel.id, actorName: channel.title, newTitle: message.meta.newTitle, removed: message.meta.removed } : null,
    replyTo:
      message.replyTo && message.replyTo !== "deleted"
        ? { ...message.replyTo, senderName: channel.title }
        : message.replyTo,
  };
}

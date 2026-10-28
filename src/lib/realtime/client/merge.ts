import { PREVIEW_LENGTH } from "@/lib/chat/limits";
import type { ChatMessage } from "@/lib/types/chat";

// The dedupe rule: a message is identified by its server id. An incoming
// server message either
//  1. is already present by id → ignored (keeps the existing entry),
//  2. matches an optimistic message by tempId → replaces it in place (the
//     tempId is kept so the React key, and the bubble, stay the same),
//  3. otherwise is inserted in createdAt order.
// The Server Action response and the socket event both go through this, in
// either order, so a message can never appear twice.
export function mergeMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
  tempId?: string | null,
): ChatMessage[] {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }

  if (tempId) {
    const index = messages.findIndex((message) => message.tempId === tempId);
    if (index !== -1) {
      const next = messages.slice();
      next[index] = { ...incoming, status: "sent", tempId };
      return next;
    }
  }

  const entry: ChatMessage = { ...incoming, status: "sent" };
  let index = messages.length;
  while (index > 0 && messages[index - 1].createdAt > entry.createdAt) index--;
  return [...messages.slice(0, index), entry, ...messages.slice(index)];
}

// Newest server-confirmed timestamp, used to catch up after a reconnect.
export function lastConfirmedAt(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].status === "sent") return messages[index].createdAt;
  }
  return null;
}

// An edit changes the message in place and every quote of it (they show the
// latest content). Order, status and everything else stay as they are.
export function applyEdit(
  messages: ChatMessage[],
  edit: { messageId: string; content: string | null; editedAt: string | null },
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id === edit.messageId) {
      return { ...message, content: edit.content, editedAt: edit.editedAt };
    }
    if (message.replyTo && message.replyTo !== "deleted" && message.replyTo.id === edit.messageId) {
      return { ...message, replyTo: { ...message.replyTo, content: edit.content?.slice(0, PREVIEW_LENGTH) ?? null } };
    }
    return message;
  });
}

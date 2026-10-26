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

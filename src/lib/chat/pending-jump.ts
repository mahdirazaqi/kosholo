"use client";

// "Forwarded from …" opens the original chat and then scrolls to the message:
// the target chat mounts later (a navigation), so the request waits here until
// its MessageList takes it. Module-level on purpose; one request at a time.
let pending: { conversationId: string; messageId: string } | null = null;

export function setPendingJump(conversationId: string, messageId: string) {
  pending = { conversationId, messageId };
}

export function takePendingJump(conversationId: string) {
  if (!pending || pending.conversationId !== conversationId) return null;
  const { messageId } = pending;
  pending = null;
  return messageId;
}

import "server-only";

import { forwardMessages, type ForwardInput, type ForwardTargetResult } from "@/lib/chat/forward";
import { emitMessageNew, emitRead } from "@/lib/realtime/emit";

// Forwards, then tells each target's members like a normal send: message:new per
// created message (per-role payloads in channels, via emitMessageNew), so unread
// counts, chat-list order and sounds work as for any new message.
export async function runForward(userId: string, input: ForwardInput): Promise<ForwardTargetResult[]> {
  const results = await forwardMessages(userId, input);
  for (const result of results) {
    if (!result.ok || !result.targetConversationId) continue;
    const tempIds = input.targets.length === 1 ? input.tempIds : undefined;
    for (const [index, message] of result.messages.entries()) {
      await emitMessageNew(result.targetConversationId, message, tempIds?.[index] ?? null);
    }
    const last = result.messages.at(-1);
    if (last) await emitRead(result.targetConversationId, userId, last.createdAt);
  }
  return results;
}

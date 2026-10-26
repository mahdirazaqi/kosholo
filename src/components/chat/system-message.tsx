import { systemMessageText } from "@/lib/chat/system-text";
import type { ChatMessage } from "@/lib/types/chat";

// Group events: a centered, small, muted pill. Not repliable.
export function SystemMessage({
  message,
  currentUserId,
  memberNames,
}: {
  message: ChatMessage;
  currentUserId: string;
  memberNames: Map<string, string>;
}) {
  if (!message.meta) return null;
  return (
    <div data-message-id={message.id} className="flex justify-center px-6 py-1.5">
      <p className="max-w-full rounded-full bg-background/85 px-3 py-1 text-center text-xs leading-5 text-muted-foreground shadow-xs ring-1 ring-foreground/5 backdrop-blur">
        {systemMessageText(message.meta, currentUserId, memberNames)}
      </p>
    </div>
  );
}

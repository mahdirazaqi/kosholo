import { SelectToggle } from "@/components/chat/message-bubble";
import { systemMessageText } from "@/lib/chat/system-text";
import type { ChatMessage, ConversationType } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

// Group events: a centered, small, muted pill. Not repliable; selectable in
// selection mode (to delete).
export function SystemMessage({
  message,
  currentUserId,
  memberNames,
  conversationType,
  selecting = false,
  selected = false,
  removing = false,
  onToggleSelect,
}: {
  message: ChatMessage;
  currentUserId: string;
  memberNames: Map<string, string>;
  conversationType: ConversationType;
  selecting?: boolean;
  selected?: boolean;
  removing?: boolean;
  onToggleSelect?: (message: ChatMessage) => void;
}) {
  if (!message.meta) return null;
  return (
    <div
      data-message-id={message.id}
      className={cn(
        "relative flex justify-center px-6 py-1.5 transition-colors",
        selecting && "ps-12",
        selected && "bg-primary/8 dark:bg-primary/12",
        removing && "pointer-events-none animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-200",
      )}
    >
      {selecting && onToggleSelect && (
        <SelectToggle selected={selected} onToggle={() => onToggleSelect(message)} />
      )}
      <p className="max-w-full rounded-full bg-background/85 px-3 py-1 text-center text-xs leading-5 text-muted-foreground shadow-xs ring-1 ring-foreground/5 backdrop-blur">
        {systemMessageText(message.meta, currentUserId, memberNames, conversationType)}
      </p>
    </div>
  );
}

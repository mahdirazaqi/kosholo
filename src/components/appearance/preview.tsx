"use client";

import { MessageBubble, type BubbleActions } from "@/components/chat/message-bubble";
import { Wallpaper } from "@/lib/appearance/wallpapers";
import type { ChatMessage } from "@/lib/types/chat";

const noop = () => {};
const ACTIONS: BubbleActions = {
  onReply: noop, onCopy: noop, onOpenActions: noop, onQuoteClick: noop, onRetry: noop, onOpenMedia: noop,
  onCancelUpload: noop, onResumeUpload: noop, onSelect: noop, onToggleSelect: noop, onDelete: noop,
  onEdit: noop, onSave: noop, onForward: noop, onOpenForward: noop,
};

const SARA = { id: "preview-sara", name: "Sara", username: "sara", avatarUrl: null };
const ME = { id: "preview-me", name: "You", username: "you", avatarUrl: null };

const base = { conversationId: "preview", media: null, location: null, meta: null, status: "sent" as const };
const MESSAGES: ChatMessage[] = [
  {
    ...base,
    id: "preview-1",
    type: "TEXT",
    content: "See you at the café at 6? ☕",
    createdAt: "2026-01-01T09:40:00.000Z",
    sender: SARA,
    replyTo: { id: "preview-0", type: "TEXT", content: "Are we still on for tonight?", senderName: "You", thumbUrl: null, duration: null, fileName: null, location: null },
  },
  { ...base, id: "preview-2", type: "TEXT", content: "Perfect, see you there!", createdAt: "2026-01-01T09:41:00.000Z", sender: ME, replyTo: null },
  { ...base, id: "preview-3", type: "TEXT", content: "👍", createdAt: "2026-01-01T09:41:30.000Z", sender: SARA, replyTo: null },
];

// A mini chat with the real bubble component, so every appearance change shows
// up here exactly as it will in a conversation. Not interactive.
export function AppearancePreview() {
  return (
    <div aria-label="Preview" role="img" className="relative isolate overflow-hidden rounded-2xl border">
      <Wallpaper />
      <div className="pointer-events-none relative flex flex-col py-2" aria-hidden>
        <div className="flex justify-center py-2">
          <span className="rounded-full bg-service-pill px-3 py-1 text-xs font-medium text-service-pill-foreground shadow-xs ring-1 ring-foreground/5">
            Today
          </span>
        </div>
        {MESSAGES.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.sender.id === ME.id}
            groupStart
            groupEnd
            isGroup={index !== 1}
            isDesktop={false}
            highlighted={false}
            read
            selecting={false}
            selected={false}
            removing={false}
            canReply={false}
            canDelete={false}
            canEdit={false}
            editing={false}
            canForward={false}
            canSave={false}
            savedChat={false}
            {...ACTIONS}
          />
        ))}
      </div>
    </div>
  );
}

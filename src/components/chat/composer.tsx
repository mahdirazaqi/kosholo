"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Forward, Mic, Pencil, Reply, SendHorizontal, X } from "lucide-react";
import { EmojiButton } from "@/components/chat/emoji-button";
import { AttachButton } from "@/components/chat/media/attach-button";
import { LocationThumb } from "@/components/chat/location/location-media";
import type { ChatLocation } from "@/lib/types/chat";
import type { VoiceRecording } from "@/hooks/use-media-sender";
import type { PreparedFile } from "@/lib/media/client/prepare";
import { previewText } from "@/components/chat/message-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCount } from "@/lib/numbers";
import type { PendingForward } from "@/lib/realtime/client/store";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { ChatMessage } from "@/lib/types/chat";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";

const MAX_HEIGHT_PX = 5 * 24 + 20; // ~5 lines of text + vertical padding

export type ComposerHandle = { focus: () => void };

// The recorder (MediaRecorder, Web Audio, gestures) loads after the page.
const VoiceControl = dynamic(() => import("@/components/chat/voice-control").then((m) => m.VoiceControl), {
  ssr: false,
  loading: () => (
    <Button type="button" size="icon-lg" disabled aria-label="Record voice message" className="size-11 shrink-0 rounded-full">
      <Mic className="size-5" />
    </Button>
  ),
});

type Props = {
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  // Edit mode (mutually exclusive with reply; the parent enforces that).
  editing: ChatMessage | null;
  onCancelEdit: () => void;
  onSaveEdit: (content: string) => void;
  onEditLast: () => void; // ArrowUp in an empty composer (desktop)
  // Pending forward (single target): exclusive with reply and edit. What is
  // typed becomes the comment; sending works with an empty field.
  forward: PendingForward | null;
  onSendForward: (comment: string) => void;
  onForwardAction: (action: "toggleSender" | "toggleCaptions" | "change" | "cancel") => void;
  onSend: (content: string) => void;
  onSendFiles: (files: PreparedFile[], caption: string | null) => void;
  onSendDocuments: (files: File[], caption: string | null) => void; // FILE messages, original bytes
  onSendLocation: (location: ChatLocation) => void;
  onSendVoice: (recording: VoiceRecording) => void;
  onInput?: (value: string) => void; // typing indicator
  onBlur?: () => void;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { replyTo, onCancelReply, editing, onCancelEdit, onSaveEdit, onEditLast, forward, onSendForward, onForwardAction, onSend, onSendFiles, onSendDocuments, onSendLocation, onSendVoice, onInput, onBlur },
  ref,
) {
  const isDesktop = useIsDesktop();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Caret position survives the textarea losing focus to the emoji picker.
  const selection = useRef({ start: 0, end: 0 });
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0;

  // Edit mode swaps the text for the message's, and puts the previous draft
  // back afterwards (adjusting state while rendering, keyed by the message).
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const currentKey = editing?.id ?? null;
  if (currentKey !== editKey) {
    setEditKey(currentKey);
    if (editing) {
      if (editKey === null) setDraft(value);
      setValue(editing.content ?? "");
    } else {
      setValue(draft);
    }
  }
  const isCaption = editing !== null && editing.type !== "TEXT";
  // Focus with the caret at the end and re-fit the height once the new text is in.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
    if (editKey) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [editKey]);

  function focus() {
    textareaRef.current?.focus({ preventScroll: true });
  }
  useImperativeHandle(ref, () => ({ focus }), []);

  function resize() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
    // Only show a scrollbar once the 5-line cap is reached.
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }

  function rememberSelection() {
    const textarea = textareaRef.current;
    if (textarea) selection.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function update(next: string, caret?: number) {
    setValue(next);
    requestAnimationFrame(() => {
      resize();
      const textarea = textareaRef.current;
      if (textarea && caret !== undefined) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(caret, caret);
        selection.current = { start: caret, end: caret };
      }
    });
  }

  function insertEmoji(emoji: string) {
    const { start, end } = selection.current;
    const next = value.slice(0, start) + emoji + value.slice(end);
    update(next, start + emoji.length);
    onInput?.(next);
  }

  function submit() {
    const content = value.trim();
    if (editing) return onSaveEdit(content); // empty text/caption is handled by the parent
    if (forward) {
      onSendForward(content);
      update("", 0);
      return;
    }
    if (!content) return;
    onSend(content);
    update("", 0);
  }

  return (
    <div className="shrink-0 border-t bg-header-bg pb-[max(env(safe-area-inset-bottom),0.5rem)]">
      {editing && (
        <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
          <Pencil className="size-5 shrink-0 text-link" />
          {editing.media?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img draggable={false} src={editing.media.thumbUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1 border-s-2 border-primary ps-2">
            <p className="truncate text-xs font-semibold text-link">{isCaption ? "Edit caption" : "Edit message"}</p>
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {previewText({
                ...editing,
                duration: editing.media?.duration,
                fileName: editing.media?.originalName,
                locationLabel: editing.location?.label,
              })}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Cancel edit"
            onClick={() => {
              onCancelEdit();
              focus();
            }}
            className="size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>
      )}

      {forward && <ForwardBar forward={forward} onAction={onForwardAction} />}

      {replyTo && (
        <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
          <Reply className="size-5 shrink-0 text-link" />
          {replyTo.location && <LocationThumb location={replyTo.location} className="size-10 shrink-0 rounded-md" />}
          {replyTo.media?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img draggable={false} src={replyTo.media.thumbUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1 border-s-2 border-primary ps-2">
            <p className="truncate text-xs font-semibold text-link">Reply to {replyTo.sender.name}</p>
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {previewText({
                ...replyTo,
                duration: replyTo.media?.duration,
                fileName: replyTo.media?.originalName,
                locationLabel: replyTo.location?.label,
              })}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Cancel reply"
            onClick={() => {
              onCancelReply();
              focus();
            }}
            className="size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="relative flex items-end gap-1 px-2 pt-2"
      >
        <EmojiButton onPick={insertEmoji} onClose={focus} />
        {!editing && !forward && (
          <AttachButton onSend={onSendFiles} onSendDocuments={onSendDocuments} onSendLocation={onSendLocation} />
        )}

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          dir="auto"
          maxLength={isCaption ? MAX_CAPTION_LENGTH : MAX_MESSAGE_LENGTH}
          placeholder={isCaption ? "Caption" : "Message"}
          aria-label="Message text"
          enterKeyHint={isDesktop ? "send" : "enter"}
          // Chat text: spell-check and autocorrect on, no browser history suggestions.
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          onChange={(event) => {
            setValue(event.target.value);
            if (!editing) onInput?.(event.target.value); // no typing indicator while editing
            resize();
          }}
          onSelect={rememberSelection}
          onBlur={() => {
            rememberSelection();
            onBlur?.();
          }}
          onKeyDown={(event) => {
            // Desktop: ArrowUp in an empty composer edits my last message.
            if (isDesktop && event.key === "ArrowUp" && !editing && value === "" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onEditLast();
              return;
            }
            // Desktop: Enter sends, Shift+Enter is a newline. Touch: Enter is always a newline.
            if (
              isDesktop &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          data-message-text
          className="max-h-[140px] min-h-11 flex-1 resize-none overflow-y-hidden rounded-3xl border border-input bg-background px-4 py-2.5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />

        {editing ? (
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Save"
            onPointerDown={(event) => event.preventDefault()}
            className="size-11 shrink-0 rounded-full transition-transform active:scale-95"
          >
            <Check className="size-5" />
          </Button>
        ) : canSend || forward ? (
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Send"
            // Keep the textarea focused (and the mobile keyboard open) when tapping send.
            onPointerDown={(event) => event.preventDefault()}
            className="size-11 shrink-0 animate-in rounded-full transition-transform zoom-in-75 duration-150 active:scale-95"
          >
            <SendHorizontal className="size-5 rtl:-scale-x-100" />
          </Button>
        ) : (
          // Empty composer: the send button becomes the mic.
          <VoiceControl onSend={onSendVoice} />
        )}
      </form>
    </div>
  );
});

const CAPTION_TYPES = ["IMAGE", "VIDEO", "FILE"];

// Above the composer: what is about to be forwarded. Tapping it opens the
// options (sender name, captions, change recipient, cancel).
function ForwardBar({
  forward,
  onAction,
}: {
  forward: PendingForward;
  onAction: (action: "toggleSender" | "toggleCaptions" | "change" | "cancel") => void;
}) {
  const { messages, hideSender, hideCaptions } = forward;
  const names = [...new Set(messages.map((m) => m.forward?.name ?? m.sender.name))];
  const shown = names.slice(0, 2).join(", ");
  const from = names.length > 2 ? `${shown} and ${names.length - 2} more` : shown;
  const first = messages[0];
  const hasCaption = messages.some((m) => CAPTION_TYPES.includes(m.type) && Boolean(m.content));
  const preview =
    messages.length === 1
      ? previewText({
          ...first,
          duration: first.media?.duration,
          fileName: first.media?.originalName,
          locationLabel: first.location?.label,
        })
      : null;

  return (
    <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Forward options"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Forward className="size-5 shrink-0 text-link" />
            {messages.length === 1 && first.media?.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img draggable={false} src={first.media.thumbUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
            )}
            <span className="min-w-0 flex-1 border-s-2 border-primary ps-2">
              <span className="block truncate text-xs font-semibold text-link">
                {messages.length === 1 ? "Forward message" : `Forward ${formatCount(messages.length, "message")}`}
              </span>
              <span dir="auto" className="block truncate text-sm text-muted-foreground">
                {hideSender ? "Sender name is hidden" : `From: ${from}`}
                {preview && ` · ${preview}`}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuItem onSelect={() => onAction("toggleSender")}>
            {hideSender ? "Show sender name" : "Hide sender name"}
          </DropdownMenuItem>
          {hasCaption && hideSender && (
            <DropdownMenuItem onSelect={() => onAction("toggleCaptions")}>
              {hideCaptions ? "Show captions" : "Hide captions"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onAction("change")}>Change recipient</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onAction("cancel")}>
            Cancel forward
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Cancel forward"
        onClick={() => onAction("cancel")}
        className="size-11 shrink-0 rounded-full text-muted-foreground"
      >
        <X className="size-5" />
      </Button>
    </div>
  );
}

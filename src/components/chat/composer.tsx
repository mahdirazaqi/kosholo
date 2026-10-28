"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Mic, Pencil, Reply, SendHorizontal, X } from "lucide-react";
import { EmojiButton } from "@/components/chat/emoji-button";
import { AttachButton } from "@/components/chat/media/attach-button";
import { LocationThumb } from "@/components/chat/location/location-media";
import type { ChatLocation } from "@/lib/types/chat";
import type { VoiceRecording } from "@/hooks/use-media-sender";
import type { PreparedFile } from "@/lib/media/client/prepare";
import { previewText } from "@/components/chat/message-preview";
import { Button } from "@/components/ui/button";
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
  onSend: (content: string) => void;
  onSendFiles: (files: PreparedFile[], caption: string | null) => void;
  onSendDocuments: (files: File[], caption: string | null) => void; // FILE messages, original bytes
  onSendLocation: (location: ChatLocation) => void;
  onSendVoice: (recording: VoiceRecording) => void;
  onInput?: (value: string) => void; // typing indicator
  onBlur?: () => void;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { replyTo, onCancelReply, editing, onCancelEdit, onSaveEdit, onEditLast, onSend, onSendFiles, onSendDocuments, onSendLocation, onSendVoice, onInput, onBlur },
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
    if (!content) return;
    onSend(content);
    update("", 0);
  }

  return (
    <div className="shrink-0 border-t bg-background/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur">
      {editing && (
        <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
          <Pencil className="size-5 shrink-0 text-primary" />
          {editing.media?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editing.media.thumbUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1 border-s-2 border-primary ps-2">
            <p className="truncate text-xs font-semibold text-primary">{isCaption ? "Edit caption" : "Edit message"}</p>
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

      {replyTo && (
        <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
          <Reply className="size-5 shrink-0 text-primary" />
          {replyTo.location && <LocationThumb location={replyTo.location} className="size-10 shrink-0 rounded-md" />}
          {replyTo.media?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={replyTo.media.thumbUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1 border-s-2 border-primary ps-2">
            <p className="truncate text-xs font-semibold text-primary">Reply to {replyTo.sender.name}</p>
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
        {!editing && (
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
          className="max-h-[140px] min-h-11 flex-1 resize-none overflow-y-hidden rounded-3xl border border-input bg-muted/40 px-4 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
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
        ) : canSend ? (
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

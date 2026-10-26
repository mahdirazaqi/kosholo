"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Reply, SendHorizontal, X } from "lucide-react";
import { EmojiButton } from "@/components/chat/emoji-button";
import { previewText } from "@/components/chat/message-preview";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { ChatMessage } from "@/lib/types/chat";
import { MAX_MESSAGE_LENGTH } from "@/lib/validations/chat";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 5 * 24 + 20; // ~5 lines of text + vertical padding

export type ComposerHandle = { focus: () => void };

type Props = {
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (content: string) => void;
  onInput?: (value: string) => void; // typing indicator
  onBlur?: () => void;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { replyTo, onCancelReply, onSend, onInput, onBlur },
  ref,
) {
  const isDesktop = useIsDesktop();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Caret position survives the textarea losing focus to the emoji picker.
  const selection = useRef({ start: 0, end: 0 });
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0;

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
    if (!content) return;
    onSend(content);
    update("", 0);
  }

  return (
    <div className="shrink-0 border-t bg-background/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur">
      {replyTo && (
        <div className="flex animate-in items-center gap-3 px-3 pt-2 fade-in-0 slide-in-from-bottom-1 duration-150">
          <Reply className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 border-s-2 border-primary ps-2">
            <p className="truncate text-xs font-semibold text-primary">پاسخ به {replyTo.sender.name}</p>
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {previewText(replyTo)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="لغو پاسخ"
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
        className="flex items-end gap-1 px-2 pt-2"
      >
        <EmojiButton onPick={insertEmoji} onClose={focus} />

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          dir="auto"
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="پیام"
          aria-label="متن پیام"
          enterKeyHint={isDesktop ? "send" : "enter"}
          onChange={(event) => {
            setValue(event.target.value);
            onInput?.(event.target.value);
            resize();
          }}
          onSelect={rememberSelection}
          onBlur={() => {
            rememberSelection();
            onBlur?.();
          }}
          onKeyDown={(event) => {
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

        <Button
          type="submit"
          size="icon-lg"
          aria-label="ارسال"
          disabled={!canSend}
          // Keep the textarea focused (and the mobile keyboard open) when tapping send.
          onPointerDown={(event) => event.preventDefault()}
          className={cn("size-11 shrink-0 rounded-full transition-transform", canSend && "active:scale-95")}
        >
          <SendHorizontal className="size-5 rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
});

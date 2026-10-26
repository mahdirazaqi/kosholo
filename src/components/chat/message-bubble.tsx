"use client";

import { memo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock3, Copy, MoreHorizontal, Reply, RotateCw } from "lucide-react";
import { ImageMedia } from "@/components/chat/media/image-media";
import { VideoMedia } from "@/components/chat/media/video-media";
import { VoiceMedia } from "@/components/chat/media/voice-media";
import { previewText } from "@/components/chat/message-preview";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { vibrate } from "@/lib/client-utils";
import { isEmojiOnly } from "@/lib/emoji";
import { formatTime } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/types/chat";
import { nameColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 60;
const SWIPE_MAX = 90;
const LONG_PRESS_MS = 450;

export type BubbleActions = {
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onOpenActions: (message: ChatMessage) => void; // mobile long-press menu
  onQuoteClick: (messageId: string) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenMedia: (message: ChatMessage) => void; // full-screen image/video
  onCancelUpload: (message: ChatMessage) => void;
};

type Props = BubbleActions & {
  message: ChatMessage;
  isMine: boolean;
  groupStart: boolean; // first of a run from the same sender
  groupEnd: boolean; // last of the run: gets the tail
  isGroup: boolean; // sender names + avatars for others' messages
  isDesktop: boolean;
  highlighted: boolean;
  read: boolean; // my message, seen by the other member (DIRECT)
};

export const MessageBubble = memo(function MessageBubble({
  message,
  isMine,
  groupStart,
  groupEnd,
  isGroup,
  isDesktop,
  highlighted,
  read,
  ...actions
}: Props) {
  const canInteract = message.status === "sent";
  const emojiOnly = message.type === "TEXT" && isEmojiOnly(message.content);
  // Images/videos sit edge-to-edge in the bubble; the time overlays them when there's no caption.
  const visual = (message.type === "IMAGE" || message.type === "VIDEO") && message.media !== null;
  const timeOverlay = visual && !message.content;
  const isNew = message.tempId !== undefined;
  // «پاسخ» from the dropdown is applied after it closes: the menu's focus trap
  // would otherwise pull focus back from the composer.
  const replyAfterClose = useRef(false);

  const menu = isDesktop && canInteract && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="گزینه‌های پیام"
          className="self-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isMine ? "end" : "start"}
        className="min-w-36"
        onCloseAutoFocus={(event) => {
          if (!replyAfterClose.current) return;
          replyAfterClose.current = false;
          event.preventDefault();
          actions.onReply(message);
        }}
      >
        <DropdownMenuItem onSelect={() => (replyAfterClose.current = true)}>
          <Reply />
          پاسخ
        </DropdownMenuItem>
        {message.content && (
          <DropdownMenuItem onSelect={() => actions.onCopy(message)}>
            <Copy />
            کپی متن
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      data-message-id={message.id}
      className={cn(
        "group/msg flex flex-col px-3 transition-colors",
        isMine ? "items-end" : "items-start",
        groupStart ? "pt-2" : "pt-0.5",
        highlighted && "message-highlight",
        isNew && "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      )}
    >
      <div className={cn("flex max-w-[85%] items-end gap-1", isMine && "flex-row-reverse")}>
        {isGroup && !isMine && (
          // Avatar on the last bubble of a run; an empty slot keeps the run aligned.
          <span className="w-7 shrink-0 self-end">
            {groupEnd && <UserAvatar user={message.sender} size="xs" />}
          </span>
        )}
        <Swipeable
          enabled={canInteract && !isDesktop}
          onSwipe={() => actions.onReply(message)}
          onLongPress={() => actions.onOpenActions(message)}
        >
          <div
            className={cn(
              "relative min-w-0 rounded-2xl",
              emojiOnly
                ? "px-1"
                : isMine
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-foreground shadow-xs ring-1 ring-foreground/5",
              !emojiOnly && (visual ? "p-1" : "px-3 py-1.5"),
              !emojiOnly && groupEnd && (isMine ? "rounded-ee-md" : "rounded-es-md"),
              !isDesktop && "select-none [-webkit-touch-callout:none]",
            )}
          >
            {isGroup && !isMine && groupStart && (
              <p className={cn("mb-0.5 truncate text-xs font-semibold", visual && "px-2 pt-0.5", nameColor(message.sender.id))}>
                {message.sender.name}
              </p>
            )}

            {message.replyTo && (
              <div className={cn(visual && "px-1 pt-0.5")}>
                <Quote replyTo={message.replyTo} isMine={isMine && !emojiOnly} onClick={actions.onQuoteClick} />
              </div>
            )}

            {visual &&
              (message.type === "IMAGE" ? (
                <ImageMedia
                  message={message}
                  overlay={timeOverlay && <TimeOverlay message={message} isMine={isMine} read={read} />}
                  onOpen={() => actions.onOpenMedia(message)}
                  onCancel={() => actions.onCancelUpload(message)}
                />
              ) : (
                <VideoMedia
                  message={message}
                  overlay={timeOverlay && <TimeOverlay message={message} isMine={isMine} read={read} />}
                  onOpen={() => actions.onOpenMedia(message)}
                  onCancel={() => actions.onCancelUpload(message)}
                />
              ))}

            {message.type === "VOICE" && message.media && (
              <VoiceMedia message={message} isMine={isMine} onCancel={() => actions.onCancelUpload(message)} />
            )}

            {message.content && (
              <p
                dir="auto"
                className={cn(
                  "break-words whitespace-pre-wrap",
                  emojiOnly ? "text-5xl leading-tight" : "text-[15px] leading-6",
                  visual && "px-2 pt-1",
                )}
              >
                {message.content}
              </p>
            )}

            {!timeOverlay && (
              <div
                className={cn(
                  "flex items-center justify-end gap-1 text-[11px] leading-4",
                  visual && "px-2 pb-0.5",
                  emojiOnly
                    ? "ms-auto mt-0.5 w-fit rounded-full bg-background/80 px-1.5 text-muted-foreground"
                    : isMine
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                )}
              >
                <time dateTime={message.createdAt} suppressHydrationWarning>
                  {formatTime(message.createdAt)}
                </time>
                {isMine && <StatusIcon status={message.status} read={read} />}
              </div>
            )}
          </div>
        </Swipeable>
        {menu}
      </div>

      {message.status === "failed" && (
        <button
          type="button"
          onClick={() => actions.onRetry(message)}
          className="mt-1 flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <RotateCw className="size-3.5" />
          ارسال نشد، تلاش مجدد
        </button>
      )}
    </div>
  );
});

function TimeOverlay({ message, isMine, read }: { message: ChatMessage; isMine: boolean; read: boolean }) {
  return (
    <span className="pointer-events-none absolute end-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[11px] leading-4 text-white">
      <time dateTime={message.createdAt} suppressHydrationWarning>
        {formatTime(message.createdAt)}
      </time>
      {isMine && <StatusIcon status={message.status} read={read} />}
    </span>
  );
}

function StatusIcon({ status, read }: { status: ChatMessage["status"]; read: boolean }) {
  if (status === "sending") return <Clock3 aria-label="در حال ارسال" className="size-3.5" />;
  if (status === "failed")
    return <AlertCircle aria-label="ارسال نشد" className="size-3.5 text-destructive" />;
  if (read) return <CheckCheck aria-label="خوانده شد" className="size-3.5" />;
  return <Check aria-label="ارسال شد" className="size-3.5" />;
}

function Quote({
  replyTo,
  isMine,
  onClick,
}: {
  replyTo: NonNullable<ChatMessage["replyTo"]>;
  isMine: boolean;
  onClick: (messageId: string) => void;
}) {
  const tone = isMine
    ? "border-primary-foreground/60 bg-primary-foreground/12"
    : "border-primary bg-primary/8";

  if (replyTo === "deleted") {
    return (
      <div className={cn("mb-1 rounded-lg border-s-[3px] px-2 py-1 text-xs italic opacity-80", tone)}>
        پیام در دسترس نیست
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick(replyTo.id);
      }}
      className={cn(
        "mb-1 flex w-full min-w-0 items-center gap-2 rounded-lg border-s-[3px] px-2 py-1 text-start text-xs transition-opacity hover:opacity-90",
        tone,
      )}
    >
      {replyTo.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={replyTo.thumbUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
      )}
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className={cn("max-w-full truncate font-semibold", !isMine && "text-primary")}>
          {replyTo.senderName}
        </span>
        <span dir="auto" className="w-full truncate opacity-80">
          {previewText(replyTo)}
        </span>
      </span>
    </button>
  );
}

// Horizontal swipe (towards the inline start) to reply, long-press for the
// actions menu. Touch/pen only; vertical drags are left to the scroller.
function Swipeable({
  enabled,
  onSwipe,
  onLongPress,
  children,
}: {
  enabled: boolean;
  onSwipe: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    axis: "x" | "y" | null;
    sign: number;
    armed: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  function end() {
    const current = gesture.current;
    if (current?.timer) clearTimeout(current.timer);
    if (current?.axis === "x" && current.armed) onSwipe();
    gesture.current = null;
    setDragging(false);
    setOffset(0);
  }

  return (
    <div
      className="relative min-w-0 touch-pan-y"
      onContextMenu={(event) => enabled && event.preventDefault()}
      onPointerDown={(event) => {
        if (!enabled || event.pointerType === "mouse") return;
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        gesture.current = {
          x: event.clientX,
          y: event.clientY,
          axis: null,
          // Swipe towards the inline start: right in RTL, left in LTR.
          sign: rtl ? 1 : -1,
          armed: false,
          timer: setTimeout(() => {
            if (gesture.current?.axis === null) {
              vibrate(10);
              gesture.current = null;
              onLongPress();
            }
          }, LONG_PRESS_MS),
        };
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (current.axis === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (current.timer) clearTimeout(current.timer);
          current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (current.axis === "x") {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
        }
        if (current.axis !== "x") return;
        const progress = Math.max(0, Math.min(SWIPE_MAX, dx * current.sign));
        if (progress >= SWIPE_THRESHOLD && !current.armed) vibrate(10);
        current.armed = progress >= SWIPE_THRESHOLD;
        setOffset(progress * current.sign);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {offset !== 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0 end-0 flex items-center"
          style={{ opacity: Math.min(1, Math.abs(offset) / SWIPE_THRESHOLD) }}
        >
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform",
              Math.abs(offset) >= SWIPE_THRESHOLD && "scale-110 bg-primary text-primary-foreground",
            )}
          >
            <Reply className="size-4" />
          </span>
        </span>
      )}
      <div
        className="relative"
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

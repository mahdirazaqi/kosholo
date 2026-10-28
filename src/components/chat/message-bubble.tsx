"use client";

import { memo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, CheckCircle2, Clock3, Copy, Download, Bookmark, Eye, Forward, MoreHorizontal, Pencil, Reply, RotateCw, Trash2 } from "lucide-react";
import { ImageMedia } from "@/components/chat/media/image-media";
import { VideoMedia } from "@/components/chat/media/video-media";
import { FileMedia } from "@/components/chat/media/file-media";
import { VoiceMedia } from "@/components/chat/media/voice-media";
import { LocationMedia, LocationThumb } from "@/components/chat/location/location-media";
import { previewText } from "@/components/chat/message-preview";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { vibrate } from "@/lib/client-utils";
import { formatCompactNumber } from "@/lib/numbers";
import { isEmojiOnly } from "@/lib/emoji";
import { formatDaySeparator, formatTime } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
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
  onOpenMedia: (message: ChatMessage) => void; // full-screen image/video/map
  onCancelUpload: (message: ChatMessage) => void;
  onResumeUpload: (message: ChatMessage) => void; // paused FILE upload: pick the file again
  onSelect: (message: ChatMessage) => void; // enter selection mode with this message
  onToggleSelect: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onSave: (message: ChatMessage) => void; // copy into Saved Messages
  onForward: (message: ChatMessage) => void; // open the forward picker
  onOpenForward: (message: ChatMessage) => void; // "Forwarded from …": open the original
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
  selecting: boolean; // selection mode: a tap toggles the message
  selected: boolean;
  removing: boolean; // being deleted: fades out before it's removed
  // Channels render posts as cards: `channelTitle` turns that on. Subscribers
  // can only copy/download; admins also reply, select and delete.
  channelTitle?: string;
  showAuthor?: boolean; // admins see which admin posted
  canReply: boolean;
  canDelete: boolean;
  canEdit: boolean; // own message / channel admin, editable type, inside the window
  editing: boolean; // the composer is in edit mode: no swipe-to-reply, no selecting
  canForward: boolean; // any sent, non-system message
  canSave: boolean; // not offered inside Saved Messages itself
  savedChat: boolean; // Saved Messages: no ticks
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
  selecting,
  selected,
  removing,
  channelTitle,
  showAuthor = false,
  canReply,
  canDelete,
  canEdit,
  editing,
  canForward,
  canSave,
  savedChat,
  ...actions
}: Props) {
  const isChannel = channelTitle !== undefined;
  const canInteract = message.status === "sent" && !selecting;
  const emojiOnly = !isChannel && message.type === "TEXT" && isEmojiOnly(message.content);
  // Images/videos sit edge-to-edge in the bubble; the time overlays them when there's no caption.
  const visual =
    ((message.type === "IMAGE" || message.type === "VIDEO") && message.media !== null) ||
    (message.type === "LOCATION" && message.location !== null);
  const timeOverlay = visual && !message.content && message.type !== "LOCATION" && !isChannel;
  const isNew = message.tempId !== undefined;
  // "Reply" from the dropdown is applied after it closes: the menu's focus trap
  // would otherwise pull focus back from the composer.
  const replyAfterClose = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const downloadable = isChannel && message.media !== null && message.status === "sent";
  const hasMenuItems = canReply || canDelete || canEdit || canSave || canForward || Boolean(message.content) || downloadable;
  const menu = isDesktop && canInteract && hasMenuItems && (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Message options"
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
        {canReply && (
          <DropdownMenuItem onSelect={() => (replyAfterClose.current = true)}>
            <Reply />
            Reply
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={() => actions.onEdit(message)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
        )}
        {message.content && (
          <DropdownMenuItem onSelect={() => actions.onCopy(message)}>
            <Copy />
            Copy text
          </DropdownMenuItem>
        )}
        {canForward && (
          <DropdownMenuItem onSelect={() => actions.onForward(message)}>
            <Forward />
            Forward
          </DropdownMenuItem>
        )}
        {canSave && (
          <DropdownMenuItem onSelect={() => actions.onSave(message)}>
            <Bookmark />
            Save
          </DropdownMenuItem>
        )}
        {downloadable && message.media && (
          <DropdownMenuItem asChild>
            <a href={message.media.url} download={message.media.originalName ?? ""}>
              <Download />
              Download
            </a>
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            {!editing && (
              <DropdownMenuItem onSelect={() => actions.onSelect(message)}>
                <CheckCircle2 />
                Select
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(message)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      data-message-id={message.id}
      // Desktop right-click opens our menu (unless text is selected: then the
      // native menu can copy the selection).
      onContextMenu={(event) => {
        if (!isDesktop || !canInteract || !hasMenuItems || selecting) return;
        if (window.getSelection()?.toString()) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
      className={cn(
        "group/msg relative flex flex-col px-3 transition-colors",
        isMine ? "items-end" : "items-start",
        groupStart ? (isChannel ? "pt-3" : "pt-2") : "pt-0.5",
        selecting && "ps-12",
        selected && "bg-primary/8 dark:bg-primary/12",
        highlighted && "message-highlight",
        isNew && !removing && "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
        removing && "pointer-events-none animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-200",
      )}
    >
      {selecting && (
        <SelectToggle selected={selected} onToggle={() => actions.onToggleSelect(message)} />
      )}
      <div
        className={cn(
          "flex items-end gap-1",
          isChannel ? "w-full max-w-xl" : "max-w-[85%]",
          isMine && "flex-row-reverse",
        )}
      >
        {isGroup && !isMine && (
          // Avatar on the last bubble of a run; an empty slot keeps the run aligned.
          <span className="w-7 shrink-0 self-end">
            {groupEnd && <UserAvatar user={message.sender} size="xs" />}
          </span>
        )}
        <Swipeable
          enabled={canInteract && !isDesktop && hasMenuItems}
          onSwipe={canReply && !editing ? () => actions.onReply(message) : undefined}
          onLongPress={() => actions.onOpenActions(message)}
          className={isChannel ? "w-full" : undefined}
        >
          <div
            className={cn(
              "relative min-w-0 rounded-2xl",
              isChannel && "w-full",
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
            {isChannel && groupStart && (
              <p dir="auto" className={cn("mb-0.5 truncate text-sm font-semibold text-primary", visual && "px-2 pt-1")}>
                {channelTitle}
              </p>
            )}
            {isGroup && !isMine && groupStart && (
              <p className={cn("mb-0.5 truncate text-xs font-semibold", visual && "px-2 pt-0.5", nameColor(message.sender.id))}>
                {message.sender.name}
              </p>
            )}

            {message.forward && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onOpenForward(message);
                }}
                className={cn(
                  "mb-0.5 flex max-w-full items-center gap-1 text-start text-xs font-semibold",
                  isMine ? "text-primary-foreground" : "text-primary",
                  visual && "px-2 pt-1",
                )}
              >
                <Forward className="size-3.5 shrink-0" />
                <span dir="auto" className="truncate">
                  Forwarded from {message.forward.name}
                </span>
              </button>
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

            {message.type === "FILE" && message.media && (
              <FileMedia
                message={message}
                isMine={isMine}
                onCancel={() => actions.onCancelUpload(message)}
                onResume={() => actions.onResumeUpload(message)}
              />
            )}

            {message.type === "LOCATION" && message.location && (
              <LocationMedia message={message} isMine={isMine} onOpen={() => actions.onOpenMedia(message)} />
            )}

            {message.content && (
              <p
                dir="auto"
                className={cn(
                  "selectable-text break-words whitespace-pre-wrap",
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
                {isChannel && (
                  <span className="me-auto flex min-w-0 items-center gap-1">
                    {(message.signature ?? (showAuthor ? message.sender.name : null)) && (
                      <span dir="auto" className="truncate">
                        {message.signature ?? message.sender.name}
                      </span>
                    )}
                  </span>
                )}
                {isChannel && message.views !== undefined && message.status === "sent" && (
                  <span className="flex items-center gap-0.5" aria-label={`${message.views} views`}>
                    <Eye className="size-3.5" />
                    {formatCompactNumber(message.views)}
                  </span>
                )}
                <Stamp message={message} />
                {(isChannel || savedChat ? message.status !== "sent" : isMine) && (
                  <StatusIcon status={message.status} read={read} />
                )}
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
          Not sent, retry
        </button>
      )}
    </div>
  );
});

// Selection mode: the whole row is one toggle (≥44px tall), with a check
// circle at the inline start. It sits above the bubble, so taps never open
// media or jump to quotes while selecting.
export function SelectToggle({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label="Select message"
      onClick={() => {
        vibrate(10);
        onToggle();
      }}
      className="absolute inset-0 z-10 flex min-h-11 items-center ps-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 bg-background/80",
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

function MessageTime({ value }: { value: string }) {
  const timeZone = useTimeZone();
  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatTime(value, timeZone)}
    </time>
  );
}

// The send time, or "edited" + the edit time. Hover (mouse) or tap opens the
// exact times. Nothing else changes in the bubble when the label appears.
function Stamp({ message }: { message: ChatMessage }) {
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  if (!message.editedAt && !message.forward) return <MessageTime value={message.createdAt} />;
  const when = (value: string) => `${formatDaySeparator(value, timeZone)} ${formatTime(value, timeZone)}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerEnter={(event) => event.pointerType === "mouse" && setOpen(true)}
          onPointerLeave={(event) => event.pointerType === "mouse" && setOpen(false)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm"
        >
          {message.editedAt && message.views !== undefined && <span aria-hidden>·</span>}
          {message.editedAt && <span>edited</span>}
          <MessageTime value={message.editedAt ?? message.createdAt} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto space-y-1 px-3 py-2 text-xs" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p suppressHydrationWarning>Sent: {when(message.createdAt)}</p>
        {message.editedAt && <p suppressHydrationWarning>Edited: {when(message.editedAt)}</p>}
        {message.forward && <p suppressHydrationWarning>Original date: {when(message.forward.originalDate)}</p>}
      </PopoverContent>
    </Popover>
  );
}

function TimeOverlay({ message, isMine, read }: { message: ChatMessage; isMine: boolean; read: boolean }) {
  return (
    <span className="pointer-events-none absolute end-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[11px] leading-4 text-white">
      <Stamp message={message} />
      {isMine && <StatusIcon status={message.status} read={read} />}
    </span>
  );
}

function StatusIcon({ status, read }: { status: ChatMessage["status"]; read: boolean }) {
  if (status === "sending") return <Clock3 aria-label="Sending" className="size-3.5" />;
  if (status === "failed")
    return <AlertCircle aria-label="Not sent" className="size-3.5 text-destructive" />;
  if (read) return <CheckCheck aria-label="Read" className="size-3.5" />;
  return <Check aria-label="Sent" className="size-3.5" />;
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
        Message unavailable
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
      {replyTo.location ? (
        <LocationThumb location={replyTo.location} className="size-8 shrink-0 rounded" />
      ) : (
        replyTo.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img draggable={false} src={replyTo.thumbUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
        )
      )}
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className={cn("max-w-full truncate font-semibold", !isMine && "text-primary")}>
          {replyTo.senderName}
        </span>
        <span dir="auto" className="w-full truncate opacity-80">
          {previewText({ ...replyTo, locationLabel: replyTo.location?.label })}
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
  className,
  children,
}: {
  enabled: boolean;
  onSwipe?: () => void; // no swipe-to-reply when missing (e.g. channel subscribers)
  onLongPress: () => void;
  className?: string;
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
    if (current?.axis === "x" && current.armed) onSwipe?.();
    gesture.current = null;
    setDragging(false);
    setOffset(0);
  }

  return (
    <div
      className={cn("relative min-w-0 touch-pan-y", className)}
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
          current.axis = onSwipe && Math.abs(dx) > Math.abs(dy) ? "x" : "y";
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

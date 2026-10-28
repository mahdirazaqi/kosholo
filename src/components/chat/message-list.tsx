"use client";

import { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { CheckCircle2, ChevronDown, Copy, Bookmark, Download, Forward, Loader2, Pencil, Reply, TextSelect, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { previewText } from "@/components/chat/message-preview";
import { MessageBubble, type BubbleActions } from "@/components/chat/message-bubble";
import { SystemMessage } from "@/components/chat/system-message";
import { MediaViewer, type ViewerTarget } from "@/components/chat/media/media-viewer";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBackLayer } from "@/hooks/use-back-layer";
import { useIsDesktop } from "@/hooks/use-media-query";
import { copyText, vibrate } from "@/lib/client-utils";
import { dayNumber, formatDaySeparator } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
import type { ChatMessage, ConversationType, MemberReadState } from "@/lib/types/chat";
import { cn } from "@/lib/utils";
import { formatCount, formatNumber } from "@/lib/numbers";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const AT_BOTTOM_THRESHOLD = 120; // px
const SHOW_JUMP_AFTER = 400; // px above the bottom
const FIRST_INDEX = 1_000_000; // Virtuoso's firstItemIndex starts high and shrinks as pages are prepended
const LONG_PRESS_MS = 450;

// One list item per message (day separators and the unread divider are drawn
// inside their message's row), so prepending N messages is exactly N items.
type Item = {
  key: string; // stable: an optimistic message keeps its tempId key when the server id arrives
  message: ChatMessage;
  newDay: boolean;
  groupStart: boolean;
  groupEnd: boolean;
};

export type MessageListHandle = { scrollToBottom: () => void };

type Props = {
  messages: ChatMessage[]; // oldest → newest, possibly a window in the middle of the history
  // Remounts the list (a jump to another window, or back to the latest).
  windowKey: number;
  // Where a fresh window starts: this message id centered, or the bottom.
  initialMessageId: string | null;
  highlightId: string | null;
  firstUnreadId: string | null; // "Unread messages" divider goes above this message
  unreadAtOpen: number; // shown on the jump button until the bottom is reached
  currentUserId: string;
  conversationType: ConversationType;
  channelTitle?: string; // CHANNEL: posts render as cards under this name
  isAdmin: boolean; // channels: admins reply, select and delete; subscribers only read
  memberNames: Map<string, string>; // current names, for system messages
  readStates: MemberReadState[]; // other members
  // Paging (the contract is in lib/chat/messages.ts).
  hasOlder: boolean;
  hasNewer: boolean; // detached: the list is a window, not attached to the latest
  loadingOlder: boolean;
  loadingNewer: boolean;
  olderError: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onJumpToLatest: () => void;
  onJumpToFirstUnread: () => void;
  onJumpToMessage: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onCancelUpload: (message: ChatMessage) => void;
  onResumeUpload: (message: ChatMessage) => void; // paused FILE upload
  // Deletion: null when not in selection mode; ids of selected messages.
  selection: Set<string> | null;
  removing: Set<string>; // fading out before removal
  onSelect: (message: ChatMessage) => void;
  onToggleSelect: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  // Editing: whether I may edit a message (permission + window), and start it.
  canEditMessage: (message: ChatMessage) => boolean;
  onEdit: (message: ChatMessage) => void;
  editing: boolean; // the composer is in edit mode
  onSave: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onOpenForward: (message: ChatMessage) => void;
};

const keyOf = (message: ChatMessage) => message.tempId ?? message.id;

// Flattens the messages into items. Day separators and 5-minute sender groups
// are computed over the whole array, so they stay right across page boundaries
// (prepending a page re-derives the flags of the old first message).
function buildItems(messages: ChatMessage[], timeZone: string, channel: boolean): Item[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const newDay = !previous || dayNumber(previous.createdAt, timeZone) !== dayNumber(message.createdAt, timeZone);
    return {
      key: keyOf(message),
      message,
      newDay,
      groupStart: newDay || !continues(previous, message, channel),
      groupEnd:
        !next ||
        !continues(message, next, channel) ||
        dayNumber(next.createdAt, timeZone) !== dayNumber(message.createdAt, timeZone),
    };
  });
}

type ListContext = { hasOlder: boolean; loadingOlder: boolean; loadingNewer: boolean; olderError: boolean; onRetry: () => void };

// The top of the list: a spinner while older messages load, a retry button on
// error, a quiet marker at the very start of the conversation.
function ListHeader({ context }: { context?: ListContext }) {
  if (!context) return null;
  return (
    <div className="flex min-h-10 items-center justify-center px-4 py-2">
      {context.olderError ? (
        <Button type="button" variant="ghost" size="sm" onClick={context.onRetry} className="h-9 rounded-full text-sm">
          Try again
        </Button>
      ) : context.loadingOlder ? (
        <Loader2 aria-label="Loading" className="size-5 animate-spin text-muted-foreground" />
      ) : !context.hasOlder ? (
        <span className="rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-xs ring-1 ring-foreground/5">
          Start of the conversation
        </span>
      ) : null}
    </div>
  );
}

// The bottom of the list: breathing room above the composer (a spinner while
// newer messages load in a detached window).
function ListFooter({ context }: { context?: ListContext }) {
  return (
    <div className="flex h-8 items-center justify-center">
      {context?.loadingNewer && <Loader2 aria-label="Loading" className="size-5 animate-spin text-muted-foreground" />}
    </div>
  );
}

export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(
  {
    messages,
    windowKey,
    initialMessageId,
    highlightId,
    firstUnreadId,
    unreadAtOpen,
    currentUserId,
    conversationType,
    channelTitle,
    isAdmin,
    memberNames,
    readStates,
    hasOlder,
    hasNewer,
    loadingOlder,
    loadingNewer,
    olderError,
    onLoadOlder,
    onLoadNewer,
    onJumpToLatest,
    onJumpToFirstUnread,
    onJumpToMessage,
    onReply,
    onRetry,
    onCancelUpload,
    onResumeUpload,
    selection,
    removing,
    onSelect,
    onToggleSelect,
    onDelete,
    canEditMessage,
    onEdit,
    editing,
    onSave,
    onForward,
    onOpenForward,
  },
  ref,
) {
  const timeZone = useTimeZone();
  const isDesktop = useIsDesktop();
  const selecting = selection !== null;
  const isChannel = conversationType === "CHANNEL";
  // Everyone may reply and delete in chats; in channels only admins.
  const canReply = !isChannel || isAdmin;
  const canDelete = !isChannel || isAdmin;
  const isSaved = conversationType === "SAVED";
  const virtuoso = useRef<VirtuosoHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [farFromBottom, setFarFromBottom] = useState(false);
  // Key of the newest message the user has seen at the bottom; incoming
  // messages after it are counted on the scroll-to-bottom button.
  const [seenKey, setSeenKey] = useState(() => {
    const last = messages.at(-1);
    return last ? keyOf(last) : null;
  });

  // ---- Items and their stable index space ----
  const items = useMemo(() => buildItems(messages, timeZone, isChannel), [messages, timeZone, isChannel]);
  const keys = useMemo(() => items.map((item) => item.key), [items]);
  // firstItemIndex keeps the visible message exactly where it is when items are
  // prepended (it shrinks by the number prepended) or removed from the top.
  // Adjusted while rendering, from the previous keys.
  const [index, setIndex] = useState({ windowKey, first: FIRST_INDEX, keys });
  if (index.keys !== keys) {
    let first = index.first;
    if (index.windowKey !== windowKey) first = FIRST_INDEX;
    else if (index.keys[0] !== keys[0]) {
      const prepended = keys.indexOf(index.keys[0]);
      if (prepended > 0) first -= prepended;
      else {
        // The old first item is gone: how many items disappeared from the top?
        const survivor = index.keys.findIndex((key) => key === keys[0]);
        if (survivor > 0) first += survivor;
      }
    }
    setIndex({ windowKey, first, keys });
  }

  // The starting position of this window: a centered message (a jump) or the bottom.
  const initial = useMemo(() => {
    const at = initialMessageId ? keys.indexOf(initialMessageId) : -1;
    return at >= 0 ? { index: at, align: "center" as const } : { index: Math.max(keys.length - 1, 0), align: "end" as const };
    // Only read when a window mounts (Virtuoso ignores later changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  // Hidden until the first frame is positioned, so the top never flashes.
  const [readyKey, setReadyKey] = useState<number | null>(null);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReadyKey(windowKey));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [windowKey]);

  const scrollToBottom = useCallback((smooth = false) => {
    virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: smooth ? "smooth" : "auto" });
  }, []);
  useImperativeHandle(ref, () => ({ scrollToBottom: () => scrollToBottom(false) }), [scrollToBottom]);

  // Sending always goes to the bottom.
  const lastItem = items.at(-1);
  const lastKey = lastItem?.key;
  const lastIsMineSending =
    lastItem?.message.sender.id === currentUserId && lastItem.message.status === "sending" && !hasNewer;
  useEffect(() => {
    if (lastIsMineSending) requestAnimationFrame(() => scrollToBottom(true));
  }, [lastKey, lastIsMineSending, scrollToBottom]);

  // The keyboard opening/closing or any resize while at the bottom: stay pinned.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current && !hasNewer) scrollToBottom(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNewer, scrollToBottom]);

  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerTarget>(null);
  // Reply chosen from the mobile sheet; applied once the sheet has closed so
  // its focus trap doesn't fight the composer for focus.
  const pendingReply = useRef<ChatMessage | null>(null);

  // A deleted message takes its open image/video viewer with it.
  const viewerGone =
    viewer?.messageId !== undefined && !messages.some((m) => m.id === viewer.messageId && !removing.has(m.id));
  const shownViewer = viewerGone ? null : viewer;
  // The lightbox isn't a Radix layer (video and map viewers are): back closes it.
  useBackLayer(shownViewer?.kind === "image", () => setViewer(null));
  // "Select text": the full text in a read-only, selectable field (touch).
  const [selectTextFor, setSelectTextFor] = useState<ChatMessage | null>(null);

  const onCopy = useCallback(async (message: ChatMessage) => {
    if (!message.content) return;
    try {
      await copyText(message.content);
      toast.success("Text copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }, []);

  const onOpenActions = useCallback((message: ChatMessage) => {
    setActionsFor(message);
    setActionsOpen(true);
  }, []);

  const onOpenMedia = useCallback((message: ChatMessage) => {
    if (message.location) {
      setViewer({ kind: "location", location: message.location, messageId: message.id });
      return;
    }
    const media = message.media;
    if (!media) return;
    setViewer({
      kind: media.kind === "VIDEO" ? "video" : "image",
      url: media.url,
      width: media.width,
      height: media.height,
      messageId: message.id,
    });
  }, []);

  // Stable so memoized bubbles don't re-render on every list update.
  const actions = useMemo<BubbleActions>(
    () => ({
      onReply,
      onCopy,
      onOpenActions,
      onQuoteClick: onJumpToMessage,
      onRetry,
      onOpenMedia,
      onCancelUpload,
      onResumeUpload,
      onSelect,
      onToggleSelect,
      onDelete,
      onEdit,
      onSave,
      onForward,
      onOpenForward,
    }),
    [onSave, onForward, onOpenForward, onReply, onCopy, onOpenActions, onJumpToMessage, onRetry, onOpenMedia, onCancelUpload, onResumeUpload, onSelect, onToggleSelect, onDelete, onEdit],
  );

  const seenIndex = seenKey === null ? -1 : messages.findIndex((m) => keyOf(m) === seenKey);
  const unseen = atBottom
    ? 0
    : messages
        .slice(seenIndex + 1)
        .filter((m) => m.sender.id !== currentUserId && m.type !== "SYSTEM").length;

  // ✓✓ once every other current member who was already in the conversation
  // when the message was sent has read it (DIRECT: the other person).
  const isRead = (message: ChatMessage) => {
    if (message.sender.id !== currentUserId || message.status !== "sent") return false;
    const expected = readStates.filter((state) => state.joinedAt <= message.createdAt);
    return (
      expected.length > 0 &&
      expected.every((state) => state.lastReadAt !== null && state.lastReadAt >= message.createdAt)
    );
  };

  const renderItem = (_index: number, item: Item) => {
    const { message, newDay, groupStart, groupEnd } = item;
    if (message.type === "SYSTEM") {
      return (
        <Fragment>
          {newDay && <DaySeparator date={message.createdAt} />}
          <SystemMessage
            message={message}
            currentUserId={currentUserId}
            memberNames={memberNames}
            conversationType={conversationType}
            selecting={selecting}
            selected={selection?.has(message.id) ?? false}
            removing={removing.has(message.id)}
            onToggleSelect={onToggleSelect}
          />
        </Fragment>
      );
    }
    return (
      <Fragment>
        {newDay && <DaySeparator date={message.createdAt} />}
        {message.id === firstUnreadId && <UnreadDivider />}
        <MessageBubble
          message={message}
          isMine={!isChannel && message.sender.id === currentUserId}
          groupStart={groupStart}
          groupEnd={groupEnd}
          isGroup={conversationType === "GROUP"}
          isDesktop={isDesktop}
          highlighted={highlightId === message.id}
          read={isRead(message)}
          selecting={selecting}
          selected={selection?.has(message.id) ?? false}
          removing={removing.has(message.id)}
          channelTitle={channelTitle}
          showAuthor={isChannel && isAdmin}
          canReply={canReply}
          canDelete={canDelete}
          canEdit={canEditMessage(message)}
          editing={editing}
          canForward={message.status === "sent"}
          canSave={!isSaved && message.status === "sent"}
          savedChat={isSaved}
          {...actions}
        />
      </Fragment>
    );
  };

  const context = useMemo<ListContext>(
    () => ({ hasOlder, loadingOlder, loadingNewer, olderError, onRetry: onLoadOlder }),
    [hasOlder, loadingOlder, loadingNewer, olderError, onLoadOlder],
  );

  // Long-press on the jump button: the first unread message.
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  // Unread messages older than the loaded page (no divider in range): the button
  // shows their count and a tap goes to the first one.
  const unreadAbove = unreadAtOpen > 0 && !firstUnreadId;
  const showJumpButton = hasNewer || !atBottom || farFromBottom || unreadAbove;
  const jumpCount = unseen > 0 ? unseen : !atBottom || hasNewer || unreadAbove ? unreadAtOpen : 0;

  return (
    <div ref={frame} className="relative min-h-0 flex-1">
      {messages.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="rounded-2xl bg-background/80 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-xs ring-1 ring-foreground/5">
            {isChannel ? (isAdmin ? "No posts yet. Publish the first one 📣" : "No posts yet") : "No messages yet. Send the first one 👋"}
          </p>
        </div>
      )}
      <Virtuoso<Item, ListContext>
        // A jump or "back to latest" is a new window: a fresh, deterministic mount.
        key={windowKey}
        ref={virtuoso}
        data={items}
        context={context}
        firstItemIndex={index.first}
        initialTopMostItemIndex={initial}
        alignToBottom
        computeItemKey={(_, item) => item.key}
        itemContent={renderItem}
        components={{ Header: ListHeader, Footer: ListFooter }}
        // Pages are fetched when the first/last item is within ~2 screens (the overscan), before the user reaches the end.
        increaseViewportBy={{ top: 1600, bottom: 800 }}
        startReached={() => hasOlder && onLoadOlder()}
        endReached={() => hasNewer && onLoadNewer()}
        // Attached and at the bottom: new messages keep the list pinned.
        followOutput={(isAtBottom) => (isAtBottom && !hasNewer ? "smooth" : false)}
        atBottomThreshold={AT_BOTTOM_THRESHOLD}
        atBottomStateChange={(bottom) => {
          atBottomRef.current = bottom;
          setAtBottom(bottom);
          if (bottom) {
            const last = messages.at(-1);
            if (last) setSeenKey(keyOf(last));
          }
        }}
        onScroll={(event) => {
          const target = event.currentTarget;
          setFarFromBottom(target.scrollHeight - target.scrollTop - target.clientHeight > SHOW_JUMP_AFTER);
        }}
        onClick={(event) => {
          // Tapping the list (not a control) dismisses the keyboard on touch devices.
          if (isDesktop || (event.target as Element).closest("button, a, [role='button'], textarea, input")) return;
          const active = document.activeElement;
          if (active instanceof HTMLElement && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) active.blur();
        }}
        className="chat-bg"
        style={{ height: "100%", visibility: readyKey === windowKey ? "visible" : "hidden" }}
      />

      <Button
        size="lg"
        variant="outline"
        aria-label={jumpCount > 0 ? `${formatCount(jumpCount, "new message")}` : "Go to latest message"}
        onClick={() => {
          if (pressFired.current) {
            pressFired.current = false;
            return;
          }
          if (unreadAbove && atBottom && !hasNewer) onJumpToFirstUnread();
          // Detached (after a jump): load the latest page and go there; never load everything in between.
          else if (hasNewer) onJumpToLatest();
          else scrollToBottom(true);
        }}
        onPointerDown={() => {
          pressFired.current = false;
          if (unreadAtOpen <= 0) return;
          press.current = setTimeout(() => {
            pressFired.current = true;
            vibrate(10);
            onJumpToFirstUnread();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => press.current && clearTimeout(press.current)}
        onPointerLeave={() => press.current && clearTimeout(press.current)}
        className={cn(
          "absolute end-3 bottom-3 h-11 min-w-11 gap-1.5 rounded-full bg-background/95 px-3 shadow-md transition-all duration-200",
          showJumpButton || unseen > 0
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-75 opacity-0",
        )}
      >
        {jumpCount > 0 && (
          <span className="text-sm font-medium text-primary">
            {formatNumber(jumpCount)} new
          </span>
        )}
        <ChevronDown className="size-5" />
      </Button>

      <MediaViewer
        target={shownViewer}
        onClose={() => setViewer(null)}
        onForward={() => {
          const message = messages.find((m) => m.id === shownViewer?.messageId);
          if (message) onForward(message);
        }}
        onSave={
          !isSaved && shownViewer?.messageId
            ? () => {
                const message = messages.find((m) => m.id === shownViewer.messageId);
                if (message) onSave(message);
              }
            : undefined
        }
      />

      <Sheet open={selectTextFor !== null} onOpenChange={(open) => !open && setSelectTextFor(null)}>
        <BottomSheetContent showCloseButton={false}>
          <SheetTitle className="px-4 text-base font-semibold">Select text</SheetTitle>
          <SheetDescription className="sr-only">Press and hold to select part of the message, then copy it</SheetDescription>
          <div className="px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <textarea
              readOnly
              dir="auto"
              value={selectTextFor?.content ?? ""}
              rows={6}
              aria-label="Message text"
              className="selectable-always max-h-[50dvh] min-h-32 w-full resize-none rounded-xl border bg-muted/40 p-3 leading-6 outline-none"
            />
          </div>
        </BottomSheetContent>
      </Sheet>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <BottomSheetContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (pendingReply.current) onReply(pendingReply.current);
            pendingReply.current = null;
          }}
        >
          <SheetTitle className="sr-only">Message options</SheetTitle>
          {actionsFor && (
            <>
              <SheetDescription dir="auto" className="mx-4 line-clamp-2 rounded-xl bg-muted px-3 py-2 text-sm">
                {previewText({
                  ...actionsFor,
                  duration: actionsFor.media?.duration,
                  fileName: actionsFor.media?.originalName,
                  locationLabel: actionsFor.location?.label,
                })}
              </SheetDescription>
              <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                {canReply && (
                  <ActionButton
                    icon={<Reply />}
                    label="Reply"
                    onClick={() => {
                      pendingReply.current = actionsFor;
                      setActionsOpen(false);
                    }}
                  />
                )}
                {actionsFor.status === "sent" && (
                  <ActionButton
                    icon={<Forward />}
                    label="Forward"
                    onClick={() => {
                      setActionsOpen(false);
                      onForward(actionsFor);
                    }}
                  />
                )}
                {!isSaved && actionsFor.status === "sent" && (
                  <ActionButton
                    icon={<Bookmark />}
                    label="Save"
                    onClick={() => {
                      setActionsOpen(false);
                      onSave(actionsFor);
                    }}
                  />
                )}
                {actionsFor.content && (
                  <ActionButton
                    icon={<TextSelect />}
                    label="Select text"
                    onClick={() => {
                      setActionsOpen(false);
                      setSelectTextFor(actionsFor);
                    }}
                  />
                )}
                {canEditMessage(actionsFor) && (
                  <ActionButton
                    icon={<Pencil />}
                    label="Edit"
                    onClick={() => {
                      setActionsOpen(false);
                      onEdit(actionsFor);
                    }}
                  />
                )}
                {actionsFor.content && (
                  <ActionButton
                    icon={<Copy />}
                    label="Copy text"
                    onClick={() => {
                      setActionsOpen(false);
                      void onCopy(actionsFor);
                    }}
                  />
                )}
                {isChannel && actionsFor.media && (
                  <a
                    href={actionsFor.media.url}
                    download={actionsFor.media.originalName ?? ""}
                    onClick={() => setActionsOpen(false)}
                    className="flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors hover:bg-muted active:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground"
                  >
                    <Download />
                    Download
                  </a>
                )}
                {canDelete && (
                  <>
                    {!editing && (
                      <ActionButton
                        icon={<CheckCircle2 />}
                        label="Select"
                        onClick={() => {
                          setActionsOpen(false);
                          onSelect(actionsFor);
                        }}
                      />
                    )}
                    <ActionButton
                      icon={<Trash2 />}
                      label="Delete"
                      destructive
                      onClick={() => {
                        setActionsOpen(false);
                        onDelete(actionsFor);
                      }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </BottomSheetContent>
      </Sheet>
    </div>
  );
});

// Same sender within 5 minutes → same visual group. System messages break runs.
// Channel posts all come from the channel, whichever admin wrote them.
function continues(a: ChatMessage, b: ChatMessage, channel: boolean) {
  return (
    a.type !== "SYSTEM" &&
    b.type !== "SYSTEM" &&
    (channel || a.sender.id === b.sender.id) &&
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() <= GROUP_WINDOW_MS
  );
}

function UnreadDivider() {
  return (
    <div data-unread-divider role="separator" className="flex items-center gap-3 px-3 py-2">
      <span className="h-px flex-1 bg-primary/30" />
      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Unread messages</span>
      <span className="h-px flex-1 bg-primary/30" />
    </div>
  );
}

function DaySeparator({ date }: { date: string }) {
  const timeZone = useTimeZone();
  return (
    <div className="sticky top-1 z-10 flex justify-center py-2">
      <span
        suppressHydrationWarning
        className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs ring-1 ring-foreground/5 backdrop-blur"
      >
        {formatDaySeparator(date, timeZone)}
      </span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors [&_svg]:size-5",
        destructive
          ? "text-destructive hover:bg-destructive/10 active:bg-destructive/10"
          : "hover:bg-muted active:bg-muted [&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

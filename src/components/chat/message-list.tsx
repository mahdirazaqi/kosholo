"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Copy, Bookmark, Download, Loader2, Pencil, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { previewText } from "@/components/chat/message-preview";
import { MessageBubble, type BubbleActions } from "@/components/chat/message-bubble";
import { SystemMessage } from "@/components/chat/system-message";
import { MediaViewer, type ViewerTarget } from "@/components/chat/media/media-viewer";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { takePendingJump } from "@/lib/chat/pending-jump";
import { copyText, nextFrame, scrollBehavior } from "@/lib/client-utils";
import { dayNumber, formatDaySeparator } from "@/lib/format-date";
import { useTimeZone } from "@/hooks/use-time-zone";
import type { ChatMessage, ConversationType, MemberReadState } from "@/lib/types/chat";
import { cn } from "@/lib/utils";
import { formatCount, formatNumber } from "@/lib/numbers";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const LOAD_MORE_THRESHOLD = 400; // px from the top
const NEAR_BOTTOM = 120; // px from the bottom
const SHOW_JUMP_BUTTON = 400;
const MAX_JUMP_PAGES = 10;
const UNREAD_SCROLL_OFFSET = 56; // keeps the divider clear of the sticky day label

type Props = {
  messages: ChatMessage[];
  firstUnreadId: string | null; // "Unread messages" divider goes above this message
  currentUserId: string;
  conversationType: ConversationType;
  channelTitle?: string; // CHANNEL: posts render as cards under this name
  isAdmin: boolean; // channels: admins reply, select and delete; subscribers only read
  memberNames: Map<string, string>; // current names, for system messages
  readStates: MemberReadState[]; // other members
  hasMore: boolean;
  loadingOlder: boolean;
  // Loads the previous page; resolves to false when nothing more was loaded.
  onLoadOlder: () => Promise<boolean>;
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
  conversationId: string;
  onSave: (message: ChatMessage) => void;
  onOpenForward: (message: ChatMessage) => void;
};

const keyOf = (message: ChatMessage) => message.tempId ?? message.id;

export function MessageList({
  messages,
  firstUnreadId,
  currentUserId,
  conversationType,
  channelTitle,
  isAdmin,
  memberNames,
  readStates,
  hasMore,
  loadingOlder,
  onLoadOlder,
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
  conversationId,
  onSave,
  onOpenForward,
}: Props) {
  const timeZone = useTimeZone();
  const isDesktop = useIsDesktop();
  const selecting = selection !== null;
  const isChannel = conversationType === "CHANNEL";
  // Everyone may reply and delete in chats; in channels only admins.
  const canReply = !isChannel || isAdmin;
  const canDelete = !isChannel || isAdmin;
  const isSaved = conversationType === "SAVED";
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastCommit = useRef<{ first?: string; last?: string; height: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // Key of the newest message the user has seen at the bottom; incoming
  // messages after it are counted on the scroll-to-bottom button.
  const [seenKey, setSeenKey] = useState(() => {
    const last = messages.at(-1);
    return last ? keyOf(last) : null;
  });
  const [highlight, setHighlight] = useState<string | null>(null);
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

  const scrollToBottom = useCallback((smooth = false) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? scrollBehavior() : "auto" });
  }, []);

  // Keep the viewport stable when messages change:
  // - first render: start at the bottom,
  // - older page prepended: keep the same messages in view (no jump),
  // - new message appended: follow it if we were at the bottom or it's ours.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const first = messages[0] && keyOf(messages[0]);
    const lastMessage = messages.at(-1);
    const last = lastMessage && keyOf(lastMessage);
    const previous = lastCommit.current;

    if (!previous) {
      // Open at the first unread message (its divider), else at the bottom.
      const divider = scroller.querySelector<HTMLElement>("[data-unread-divider]");
      if (divider) {
        scroller.scrollTop +=
          divider.getBoundingClientRect().top - scroller.getBoundingClientRect().top - UNREAD_SCROLL_OFFSET;
        const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        nearBottom.current = distance < NEAR_BOTTOM;
        setAtBottom(nearBottom.current);
        setShowJump(distance > SHOW_JUMP_BUTTON);
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
    } else if (first !== previous.first && messages.some((m) => keyOf(m) === previous.first)) {
      scroller.scrollTop += scroller.scrollHeight - previous.height;
    } else if (last !== previous.last) {
      const mine = lastMessage?.sender.id === currentUserId && lastMessage.status === "sending";
      if (nearBottom.current || mine) scrollToBottom(true);
    }

    lastCommit.current = { first, last, height: scroller.scrollHeight };
  }, [messages, currentUserId, scrollToBottom]);

  const loadIfNeeded = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller && hasMore && !loadingOlder && scroller.scrollTop < LOAD_MORE_THRESHOLD) {
      void onLoadOlder();
    }
  }, [hasMore, loadingOlder, onLoadOlder]);

  // A short first page may not fill the screen, so there's nothing to scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && scroller.scrollHeight <= scroller.clientHeight) loadIfNeeded();
  }, [messages, loadIfNeeded]);

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    nearBottom.current = distance < NEAR_BOTTOM;
    setAtBottom(nearBottom.current);
    setShowJump(distance > SHOW_JUMP_BUTTON);
    const last = messages.at(-1);
    if (nearBottom.current && last) setSeenKey(keyOf(last));
    loadIfNeeded();
  }

  const jumpTo = useCallback(
    async (messageId: string) => {
      for (let page = 0; page <= MAX_JUMP_PAGES; page++) {
        const target = scrollerRef.current?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(messageId)}"]`,
        );
        if (target) {
          target.scrollIntoView({ block: "center", behavior: scrollBehavior() });
          setHighlight(null);
          await nextFrame();
          setHighlight(messageId);
          setTimeout(() => setHighlight((current) => (current === messageId ? null : current)), 1500);
          return;
        }
        // onLoadOlder resolves to false once there is nothing older to load.
        if (page === MAX_JUMP_PAGES || !(await onLoadOlder())) break;
        await nextFrame();
      }
      toast.error("Original message not found");
    },
    [onLoadOlder],
  );

  // Coming from "Forwarded from …": scroll to (and highlight) that message.
  useEffect(() => {
    const target = takePendingJump(conversationId);
    if (target) void jumpTo(target);
    // Once per mount: the request is consumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onQuoteClick: jumpTo,
      onRetry,
      onOpenMedia,
      onCancelUpload,
      onResumeUpload,
      onSelect,
      onToggleSelect,
      onDelete,
      onEdit,
      onSave,
      onOpenForward,
    }),
    [onSave, onOpenForward, onReply, onCopy, onOpenActions, jumpTo, onRetry, onOpenMedia, onCancelUpload, onResumeUpload, onSelect, onToggleSelect, onDelete, onEdit],
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

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="chat-bg h-full overflow-y-auto overscroll-contain pb-3 [overflow-anchor:none]"
      >
        <div className="flex h-8 items-center justify-center">
          {loadingOlder && <Loader2 aria-label="Loading" className="size-5 animate-spin text-muted-foreground" />}
        </div>

        {messages.length === 0 && (
          <div className="flex h-[calc(100%-2rem)] items-center justify-center px-8 text-center">
            <p className="rounded-2xl bg-background/80 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-xs ring-1 ring-foreground/5">
              {isChannel ? (isAdmin ? "No posts yet. Publish the first one 📣" : "No posts yet") : "No messages yet. Send the first one 👋"}
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const newDay = !previous || dayNumber(previous.createdAt, timeZone) !== dayNumber(message.createdAt, timeZone);
          const groupStart = newDay || !continues(previous, message, isChannel);
          const groupEnd = !next || !continues(message, next, isChannel) || dayNumber(next.createdAt, timeZone) !== dayNumber(message.createdAt, timeZone);

          if (message.type === "SYSTEM") {
            return (
              <Fragment key={keyOf(message)}>
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
            <Fragment key={keyOf(message)}>
              {newDay && <DaySeparator date={message.createdAt} />}
              {message.id === firstUnreadId && <UnreadDivider />}
              <MessageBubble
                message={message}
                isMine={!isChannel && message.sender.id === currentUserId}
                groupStart={groupStart}
                groupEnd={groupEnd}
                isGroup={conversationType === "GROUP"}
                isDesktop={isDesktop}
                highlighted={highlight === message.id}
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
                canSave={!isSaved && message.status === "sent"}
                savedChat={isSaved}
                {...actions}
              />
            </Fragment>
          );
        })}
      </div>

      <Button
        size="lg"
        variant="outline"
        aria-label={unseen > 0 ? `${formatCount(unseen, "new message")}` : "Go to latest message"}
        onClick={() => scrollToBottom(true)}
        className={cn(
          "absolute end-3 bottom-3 h-11 min-w-11 gap-1.5 rounded-full bg-background/95 px-3 shadow-md transition-all duration-200",
          !atBottom && (showJump || unseen > 0)
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-75 opacity-0",
        )}
      >
        {unseen > 0 && (
          <span className="text-sm font-medium text-primary">
            {formatNumber(unseen)} new
          </span>
        )}
        <ChevronDown className="size-5" />
      </Button>

      <MediaViewer
        target={shownViewer}
        onClose={() => setViewer(null)}
        onSave={
          !isSaved && shownViewer?.messageId
            ? () => {
                const message = messages.find((m) => m.id === shownViewer.messageId);
                if (message) onSave(message);
              }
            : undefined
        }
      />

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
}

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

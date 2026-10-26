"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Loader2, Reply } from "lucide-react";
import { toast } from "sonner";
import { previewText } from "@/components/chat/message-preview";
import { MessageBubble, type BubbleActions } from "@/components/chat/message-bubble";
import { SystemMessage } from "@/components/chat/system-message";
import { MediaViewer, type ViewerTarget } from "@/components/chat/media/media-viewer";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { copyText, nextFrame, scrollBehavior } from "@/lib/client-utils";
import { dayNumber, formatDaySeparator } from "@/lib/format-date";
import type { ChatMessage, ConversationType, MemberReadState } from "@/lib/types/chat";
import { cn } from "@/lib/utils";
import { toFaDigits } from "@/lib/digits";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const LOAD_MORE_THRESHOLD = 400; // px from the top
const NEAR_BOTTOM = 120; // px from the bottom
const SHOW_JUMP_BUTTON = 400;
const MAX_JUMP_PAGES = 10;

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
  conversationType: ConversationType;
  memberNames: Map<string, string>; // current names, for system messages
  readStates: MemberReadState[]; // other members
  hasMore: boolean;
  loadingOlder: boolean;
  // Loads the previous page; resolves to false when nothing more was loaded.
  onLoadOlder: () => Promise<boolean>;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onCancelUpload: (message: ChatMessage) => void;
};

const keyOf = (message: ChatMessage) => message.tempId ?? message.id;

export function MessageList({
  messages,
  currentUserId,
  conversationType,
  memberNames,
  readStates,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onReply,
  onRetry,
  onCancelUpload,
}: Props) {
  const isDesktop = useIsDesktop();
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
      scroller.scrollTop = scroller.scrollHeight;
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
      toast.error("پیام اصلی پیدا نشد");
    },
    [onLoadOlder],
  );

  const onCopy = useCallback(async (message: ChatMessage) => {
    if (!message.content) return;
    try {
      await copyText(message.content);
      toast.success("متن کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  }, []);

  const onOpenActions = useCallback((message: ChatMessage) => {
    setActionsFor(message);
    setActionsOpen(true);
  }, []);

  const onOpenMedia = useCallback((message: ChatMessage) => {
    const media = message.media;
    if (!media) return;
    setViewer({
      kind: media.kind === "VIDEO" ? "video" : "image",
      url: media.url,
      width: media.width,
      height: media.height,
    });
  }, []);

  // Stable so memoized bubbles don't re-render on every list update.
  const actions = useMemo<BubbleActions>(
    () => ({ onReply, onCopy, onOpenActions, onQuoteClick: jumpTo, onRetry, onOpenMedia, onCancelUpload }),
    [onReply, onCopy, onOpenActions, jumpTo, onRetry, onOpenMedia, onCancelUpload],
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
          {loadingOlder && <Loader2 aria-label="در حال بارگذاری" className="size-5 animate-spin text-muted-foreground" />}
        </div>

        {messages.length === 0 && (
          <div className="flex h-[calc(100%-2rem)] items-center justify-center px-8 text-center">
            <p className="rounded-2xl bg-background/80 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-xs ring-1 ring-foreground/5">
              هنوز پیامی رد و بدل نشده است. اولین پیام را بفرستید 👋
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const newDay = !previous || dayNumber(previous.createdAt) !== dayNumber(message.createdAt);
          const groupStart = newDay || !continues(previous, message);
          const groupEnd = !next || !continues(message, next) || dayNumber(next.createdAt) !== dayNumber(message.createdAt);

          if (message.type === "SYSTEM") {
            return (
              <Fragment key={keyOf(message)}>
                {newDay && <DaySeparator date={message.createdAt} />}
                <SystemMessage message={message} currentUserId={currentUserId} memberNames={memberNames} />
              </Fragment>
            );
          }

          return (
            <Fragment key={keyOf(message)}>
              {newDay && <DaySeparator date={message.createdAt} />}
              <MessageBubble
                message={message}
                isMine={message.sender.id === currentUserId}
                groupStart={groupStart}
                groupEnd={groupEnd}
                isGroup={conversationType === "GROUP"}
                isDesktop={isDesktop}
                highlighted={highlight === message.id}
                read={isRead(message)}
                {...actions}
              />
            </Fragment>
          );
        })}
      </div>

      <Button
        size="lg"
        variant="outline"
        aria-label={unseen > 0 ? `${toFaDigits(unseen)} پیام جدید` : "رفتن به آخرین پیام"}
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
            {toFaDigits(unseen)} پیام جدید
          </span>
        )}
        <ChevronDown className="size-5" />
      </Button>

      <MediaViewer target={viewer} onClose={() => setViewer(null)} />

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <BottomSheetContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (pendingReply.current) onReply(pendingReply.current);
            pendingReply.current = null;
          }}
        >
          <SheetTitle className="sr-only">گزینه‌های پیام</SheetTitle>
          {actionsFor && (
            <>
              <SheetDescription dir="auto" className="mx-4 line-clamp-2 rounded-xl bg-muted px-3 py-2 text-sm">
                {previewText({ ...actionsFor, duration: actionsFor.media?.duration })}
              </SheetDescription>
              <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <ActionButton
                  icon={<Reply />}
                  label="پاسخ"
                  onClick={() => {
                    pendingReply.current = actionsFor;
                    setActionsOpen(false);
                  }}
                />
                {actionsFor.content && (
                  <ActionButton
                    icon={<Copy />}
                    label="کپی متن"
                    onClick={() => {
                      setActionsOpen(false);
                      void onCopy(actionsFor);
                    }}
                  />
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
function continues(a: ChatMessage, b: ChatMessage) {
  return (
    a.type !== "SYSTEM" &&
    b.type !== "SYSTEM" &&
    a.sender.id === b.sender.id &&
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() <= GROUP_WINDOW_MS
  );
}

function DaySeparator({ date }: { date: string }) {
  return (
    <div className="sticky top-1 z-10 flex justify-center py-2">
      <span
        suppressHydrationWarning
        className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs ring-1 ring-foreground/5 backdrop-blur"
      >
        {formatDaySeparator(date)}
      </span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors hover:bg-muted active:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground"
    >
      {icon}
      {label}
    </button>
  );
}

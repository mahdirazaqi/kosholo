"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bookmark, Check, ListChecks, Loader2, Megaphone, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { forwardMessages, getForwardTargets } from "@/app/(app)/chats/forward-actions";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { vibrate } from "@/lib/client-utils";
import { MAX_FORWARD_TARGETS } from "@/lib/chat/forward-limits";
import { formatCount, formatNumber } from "@/lib/numbers";
import { useRealtimeStore } from "@/lib/realtime/client/store";
import type { ChatMessage, ConversationListItem } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { cn } from "@/lib/utils";

export type ForwardDraft = { sourceConversationId: string; messages: ChatMessage[] };

// A place a forward can go: an existing conversation, or a contact I have no
// chat with yet (its direct conversation is created when needed).
export type PickedTarget = { conversationId: string; title: string } | { userId: string; title: string };

type Row =
  | { key: string; kind: "saved"; conversationId: string; title: string }
  | { key: string; kind: "chat"; item: ConversationListItem; title: string }
  | { key: string; kind: "contact"; user: PublicUser; title: string };

const LONG_PRESS_MS = 450;
const CAPTION_TYPES = ["IMAGE", "VIDEO", "FILE"];

// "Forward to…": a bottom sheet on phones, a dialog on desktop. Tap a row to
// forward to one chat (the messages wait in its composer); long-press a row or
// use "Select multiple" to forward to up to 10 chats at once with a comment.
export function ForwardPicker({
  open,
  onOpenChange,
  draft,
  onPickSingle,
  onForwarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ForwardDraft | null;
  onPickSingle: (target: PickedTarget) => void;
  onForwarded: () => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const body = open && draft && (
    <PickerBody draft={draft} onPickSingle={onPickSingle} onForwarded={onForwarded} onClose={() => onOpenChange(false)} />
  );
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-lg font-bold">Forward to…</DialogTitle>
            <DialogDescription className="sr-only">Choose where to forward the messages</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[90dvh] gap-0">
        <SheetHeader className="pt-3">
          <SheetTitle className="text-lg font-bold">Forward to…</SheetTitle>
          <SheetDescription className="sr-only">Choose where to forward the messages</SheetDescription>
        </SheetHeader>
        {body}
      </BottomSheetContent>
    </Sheet>
  );
}

function PickerBody({
  draft,
  onPickSingle,
  onForwarded,
  onClose,
}: {
  draft: ForwardDraft;
  onPickSingle: (target: PickedTarget) => void;
  onForwarded: () => void;
  onClose: () => void;
}) {
  const conversations = useRealtimeStore((state) => state.conversations);
  const [extra, setExtra] = useState<{ savedConversationId: string; contacts: PublicUser[] } | null>(null);
  const [query, setQuery] = useState("");
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); // row keys
  const [comment, setComment] = useState("");
  const [hideSender, setHideSender] = useState(false);
  const [hideCaptions, setHideCaptions] = useState(false);
  const [pending, startTransition] = useTransition();
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getForwardTargets()
      .then((targets) => !cancelled && setExtra(targets))
      .catch(() => !cancelled && toast.error("Couldn't load your contacts"));
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCaption = draft.messages.some((m) => CAPTION_TYPES.includes(m.type) && Boolean(m.content));

  // Saved Messages, then recent chats I can send to, then contacts with no chat.
  const rows = useMemo<Row[]>(() => {
    const list = conversations ?? [];
    const result: Row[] = [];
    if (extra) result.push({ key: `c:${extra.savedConversationId}`, kind: "saved", conversationId: extra.savedConversationId, title: "Saved Messages" });
    for (const item of list) {
      if (item.type === "SAVED") continue;
      if (item.type === "CHANNEL" && item.myRole !== "ADMIN") continue; // can't post there
      result.push({ key: `c:${item.id}`, kind: "chat", item, title: item.title });
    }
    const withChat = new Set(list.map((item) => item.otherUser?.id).filter(Boolean));
    for (const user of extra?.contacts ?? []) {
      if (!withChat.has(user.id)) result.push({ key: `u:${user.id}`, kind: "contact", user, title: user.name });
    }
    return result;
  }, [conversations, extra]);

  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const visible = needle
    ? rows.filter((row) => {
        const username = row.kind === "chat" ? row.item.otherUser?.username : row.kind === "contact" ? row.user.username : undefined;
        return row.title.toLowerCase().includes(needle) || Boolean(username?.includes(needle));
      })
    : rows;

  const targetOf = (row: Row): PickedTarget =>
    row.kind === "contact"
      ? { userId: row.user.id, title: row.title }
      : { conversationId: row.kind === "saved" ? row.conversationId : row.item.id, title: row.title };

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : current.length >= MAX_FORWARD_TARGETS ? current : [...current, key],
    );
  }

  function tap(row: Row) {
    if (press.current?.fired) {
      press.current = null;
      return; // the long-press already handled it
    }
    if (multi) return toggle(row.key);
    onPickSingle(targetOf(row));
    onClose();
  }

  function send() {
    const chosen = selected.map((key) => rows.find((row) => row.key === key)).filter((row): row is Row => Boolean(row));
    startTransition(async () => {
      const result = await forwardMessages({
        sourceConversationId: draft.sourceConversationId,
        messageIds: draft.messages.map((m) => m.id),
        targets: chosen.map((row) =>
          row.kind === "contact" ? { userId: row.user.id } : { conversationId: row.kind === "saved" ? row.conversationId : row.item.id },
        ),
        comment: comment.trim() || null,
        hideSender,
        hideCaptions: hideSender && hideCaptions && hasCaption,
      }).catch(() => null);
      if (!result) return void toast.error("Couldn't forward, please try again");
      if (!result.ok) return void toast.error(result.error);

      const failed = result.results.filter((r) => !r.ok);
      const okCount = result.results.length - failed.length;
      const onlySaved = chosen.length === 1 && chosen[0].kind === "saved";
      if (okCount > 0) toast.success(onlySaved ? "Saved to Saved Messages" : `Forwarded to ${formatCount(okCount, "chat")}`);
      for (const r of failed) {
        const title = chosen.find((row) => row.kind !== "contact" && (row.kind === "saved" ? row.conversationId : row.item.id) === r.targetConversationId)?.title;
        toast.error(`${title ?? "A chat"}: ${r.error ?? "couldn't forward"}`);
      }
      if (okCount > 0) {
        onForwarded();
        onClose();
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-2 pb-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4.5 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats and contacts"
            aria-label="Search chats and contacts"
            className="h-11 rounded-xl bg-muted/50 ps-10"
          />
        </div>
        <Button
          type="button"
          variant={multi ? "secondary" : "ghost"}
          size="icon-lg"
          aria-label="Select multiple chats"
          aria-pressed={multi}
          onClick={() => {
            setMulti((current) => !current);
            setSelected([]);
          }}
          className="size-11 shrink-0 rounded-full"
        >
          <ListChecks className="size-5" />
        </Button>
      </div>
      {multi && (
        <p aria-live="polite" className="px-4 pb-1 text-sm text-muted-foreground">
          {formatNumber(selected.length)} selected · up to {formatNumber(MAX_FORWARD_TARGETS)}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visible.map((row, index) => {
          const checked = selected.includes(row.key);
          const section =
            row.kind === "contact" && visible[index - 1]?.kind !== "contact"
              ? "Contacts"
              : row.kind === "chat" && visible[index - 1]?.kind === "saved"
                ? "Recent chats"
                : null;
          return (
            <li key={row.key}>
              {section && <h3 className="px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{section}</h3>}
              <button
                type="button"
                onClick={() => tap(row)}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse" || multi) return;
                  press.current = {
                    fired: false,
                    timer: setTimeout(() => {
                      if (!press.current) return;
                      press.current.fired = true;
                      vibrate(10);
                      setMulti(true);
                      setSelected([row.key]);
                    }, LONG_PRESS_MS),
                  };
                }}
                onPointerUp={() => press.current && clearTimeout(press.current.timer)}
                onPointerLeave={() => press.current && clearTimeout(press.current.timer)}
                onContextMenu={(event) => event.preventDefault()}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start transition-colors select-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted"
              >
                <RowAvatar row={row} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{row.title}</span>
                    {row.kind === "chat" && row.item.type === "GROUP" && <Users aria-label="Group" className="size-3.5 shrink-0 text-muted-foreground" />}
                    {row.kind === "chat" && row.item.type === "CHANNEL" && <Megaphone aria-label="Channel" className="size-3.5 shrink-0 text-muted-foreground" />}
                  </span>
                  {row.kind === "contact" && (
                    <span className="block truncate text-sm text-muted-foreground">
                      <bdi dir="ltr">@{row.user.username}</bdi>
                    </span>
                  )}
                </span>
                {multi && (
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {!extra && <Loader2 aria-label="Loading" className="mx-auto my-4 size-5 animate-spin text-muted-foreground" />}
        {extra && visible.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">No matching chats</li>}
      </ul>

      {multi && (
        <div className="space-y-3 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a message…"
            aria-label="Add a message"
            dir="auto"
            className="h-11 rounded-xl"
          />
          <label className="flex min-h-9 items-center justify-between gap-3 text-sm">
            Hide sender name
            <Switch checked={hideSender} onCheckedChange={setHideSender} aria-label="Hide sender name" />
          </label>
          {hasCaption && (
            <label className={cn("flex min-h-9 items-center justify-between gap-3 text-sm", !hideSender && "opacity-50")}>
              Hide captions
              <Switch checked={hideSender && hideCaptions} disabled={!hideSender} onCheckedChange={setHideCaptions} aria-label="Hide captions" />
            </label>
          )}
          <Button size="lg" disabled={selected.length === 0 || pending} onClick={send} className="h-12 w-full rounded-xl text-base">
            {pending && <Loader2 className="animate-spin" />}
            Forward{selected.length > 0 && ` (${formatNumber(selected.length)})`}
          </Button>
        </div>
      )}
    </div>
  );
}

function RowAvatar({ row }: { row: Row }) {
  if (row.kind === "saved") {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bookmark className="size-5 fill-current" />
      </span>
    );
  }
  const user = row.kind === "contact" ? row.user : (row.item.otherUser ?? { id: row.item.id, name: row.item.title, avatarUrl: row.item.avatarUrl });
  return <UserAvatar user={user} />;
}

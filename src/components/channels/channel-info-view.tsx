"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Crown,
  Image as ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addSubscribers,
  getInviteToken,
  listChannelMembers,
  removeSubscriber,
  resetInviteToken,
  setChannelRole,
  transferOwnership,
  updateChannel,
} from "@/app/(app)/chats/channel-actions";
import { setChannelPhoto } from "@/app/(app)/photo-actions";
import { AvatarEditor } from "@/components/avatar-editor";
import { BackButton } from "@/components/back-button";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { ConversationDangerZone } from "@/components/chat/conversation-actions";
import { MuteSwitch } from "@/components/chat/mute-switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MemberPicker } from "@/components/groups/member-picker";
import { LinkifiedText } from "@/components/linkified-text";
import { PageHeader } from "@/components/page-header";
import { useMemberPhotos } from "@/components/profile/member-photos";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTimeZone } from "@/hooks/use-time-zone";
import { formatFullDate } from "@/lib/format-date";
import { formatCount, formatNumber } from "@/lib/numbers";
import { getSocket } from "@/lib/realtime/client/socket";
import { isLocalDelete } from "@/lib/realtime/client/store";
import type {
  ConversationDeletedPayload,
  ConversationRemovedPayload,
  ConversationUpdatedPayload,
} from "@/lib/realtime/events";
import type { ChannelInfo, ChannelMember } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { channelDescriptionSchema, channelTitleSchema, MAX_CHANNEL_DESCRIPTION } from "@/lib/validations/channels";

type Confirm =
  | { kind: "promote" | "demote" | "remove"; member: ChannelMember }
  | { kind: "resetLink" };

const SEARCH_DEBOUNCE_MS = 300;

// Admin-only sections are hidden for subscribers, but every action is checked
// again on the server (channel-actions.ts). Subscribers never receive the
// people lists or the invite token at all.
export function ChannelInfoView({ initialInfo, contacts }: { initialInfo: ChannelInfo; contacts: PublicUser[] }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [info, setInfo] = useState(initialInfo);
  const [pending, startTransition] = useTransition();
  const memberPhotos = useMemberPhotos();
  const isAdmin = info.myRole === "ADMIN";

  // ---- Subscribers (admins): searchable, paged ----
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const requestId = useRef(0);

  const loadMembers = useCallback(
    async (search: string, cursor: string | null) => {
      const id = ++requestId.current;
      setLoadingMembers(true);
      try {
        const page = await listChannelMembers(info.id, search, cursor);
        if (id !== requestId.current || !page) return;
        setMembers((current) => (cursor ? [...current, ...page.members] : page.members));
        setNextCursor(page.nextCursor);
      } finally {
        if (id === requestId.current) setLoadingMembers(false);
      }
    },
    [info.id],
  );

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => void loadMembers(query, null), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [isAdmin, query, loadMembers]);

  // ---- Invite link ----
  const [token, setToken] = useState(info.inviteToken);
  const link = token && typeof window !== "undefined" ? `${window.location.origin}/join/${token}` : null;

  // ---- Settings ----
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(info.title);
  const [descriptionDraft, setDescriptionDraft] = useState(info.description ?? "");

  // ---- Sheets and dialogs ----
  const [selected, setSelected] = useState<ChannelMember | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Live: info changes, people changes (admins refetch), role/ownership
  // changes, and being removed or the channel being deleted.
  useEffect(() => {
    const socket = getSocket();
    const onUpdated = (payload: ConversationUpdatedPayload) => {
      if (payload.conversationId !== info.id) return;
      setInfo((current) => ({
        ...current,
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.signMessages !== undefined ? { signMessages: payload.signMessages } : {}),
        ...(payload.memberCount !== undefined ? { memberCount: payload.memberCount } : {}),
        ...(payload.myRole !== undefined ? { myRole: payload.myRole } : {}),
        ...(payload.isOwner !== undefined ? { isOwner: payload.isOwner } : {}),
      }));
      if (payload.myRole !== undefined) router.refresh(); // admins also get the admin lists and the link
      if (payload.membersChanged) {
        void loadMembers(queryRef.current, null);
        router.refresh(); // the admin list is small: refetched with the page
      }
    };
    const onRemoved = ({ conversationId, reason }: ConversationRemovedPayload) => {
      if (conversationId !== info.id || isLocalDelete(conversationId)) return;
      toast.error(reason === "deleted" ? "This channel was deleted" : "You're no longer subscribed to this channel");
      router.replace("/");
    };
    const onDeleted = ({ conversationId }: ConversationDeletedPayload) => {
      if (conversationId !== info.id) return;
      if (!isLocalDelete(conversationId)) toast("This channel was deleted");
      router.replace("/");
    };
    socket.on("conversation:updated", onUpdated);
    socket.on("conversation:removed", onRemoved);
    socket.on("conversation:deleted", onDeleted);
    return () => {
      socket.off("conversation:updated", onUpdated);
      socket.off("conversation:removed", onRemoved);
      socket.off("conversation:deleted", onDeleted);
    };
  }, [info.id, router, loadMembers]);

  // A server refresh (router.refresh) brings new props: adopt them.
  const [seenInfo, setSeenInfo] = useState(initialInfo);
  if (seenInfo !== initialInfo) {
    setSeenInfo(initialInfo);
    setInfo(initialInfo);
    setToken(initialInfo.inviteToken);
  }

  function act(work: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) return void toast.error(result.error);
      if (success) toast.success(success);
      setConfirm(null);
      setSheetOpen(false);
      after?.();
    });
  }

  function saveDetails() {
    const title = channelTitleSchema.safeParse(titleDraft);
    if (!title.success) return void toast.error(title.error.issues[0].message);
    const description = channelDescriptionSchema.safeParse(descriptionDraft);
    if (!description.success) return void toast.error(description.error.issues[0].message);
    act(
      () => updateChannel(info.id, { title: title.data, description: description.data }),
      "Channel updated",
      () => {
        setInfo((current) => ({ ...current, title: title.data, description: description.data ?? null }));
        setEditing(false);
      },
    );
  }

  function toggleSign(signMessages: boolean) {
    setInfo((current) => ({ ...current, signMessages }));
    startTransition(async () => {
      const result = await updateChannel(info.id, { signMessages });
      if (!result.ok) {
        setInfo((current) => ({ ...current, signMessages: !signMessages }));
        toast.error(result.error);
      }
    });
  }

  async function ensureLink() {
    const result = await getInviteToken(info.id);
    if (!result.ok) throw new Error(result.error);
    setToken(result.token);
    return `${window.location.origin}/join/${result.token}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link ?? (await ensureLink()));
      toast.success("Link copied");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Couldn't copy the link");
    }
  }

  async function shareLink() {
    try {
      const url = link ?? (await ensureLink());
      if (navigator.share) await navigator.share({ title: info.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return; // closed the share sheet
      toast.error("Couldn't share the link");
    }
  }

  function runConfirm() {
    if (!confirm) return;
    switch (confirm.kind) {
      case "promote":
        return act(() => setChannelRole(info.id, confirm.member.id, "ADMIN"), `${confirm.member.name} is now an admin`);
      case "demote":
        return act(() => setChannelRole(info.id, confirm.member.id, "MEMBER"), `${confirm.member.name} is no longer an admin`);
      case "remove":
        return act(() => removeSubscriber(info.id, confirm.member.id), `${confirm.member.name} was removed from the channel`);
      case "resetLink":
        return startTransition(async () => {
          const result = await resetInviteToken(info.id);
          if (!result.ok) return void toast.error(result.error);
          setToken(result.token);
          setConfirm(null);
          toast.success("The old link no longer works");
        });
    }
  }

  const confirmCopy = confirm && confirmText(confirm);
  const admins = info.admins;
  // Who the actor may act on (the server re-checks): the owner can demote and
  // remove admins; any admin can promote or remove a subscriber; nobody
  // touches the owner or themselves.
  const actionsFor = (member: ChannelMember): ("promote" | "demote" | "remove")[] => {
    if (!isAdmin || member.isOwner) return [];
    if (member.role === "ADMIN") return info.isOwner ? ["demote", "remove"] : [];
    return ["promote", "remove"];
  };
  const selectedActions = selected ? actionsFor(selected) : [];

  return (
    <>
      <PageHeader start={<BackButton fallback={`/chats/${info.id}`} />} title="Channel info" />

      <div className="space-y-4 px-4 py-6">
        <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
          {isAdmin ? (
            <AvatarEditor
              entity={{ id: info.id, name: info.title, avatarUrl: info.avatarUrl }}
              onSave={(uploadId) => setChannelPhoto(info.id, uploadId)}
              label="channel photo"
            />
          ) : (
            <UserAvatar user={{ id: info.id, name: info.title, avatarUrl: info.avatarUrl }} size="2xl" />
          )}
          <div className="flex items-center gap-1">
            <h1 dir="auto" className="text-xl font-bold">{info.title}</h1>
            {isAdmin && !editing && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit channel details"
                onClick={() => {
                  setTitleDraft(info.title);
                  setDescriptionDraft(info.description ?? "");
                  setEditing(true);
                }}
                className="size-9 rounded-full text-muted-foreground"
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Megaphone className="size-4" />
            Channel · {formatCount(info.memberCount, "subscriber")}
          </p>
          {info.description && !editing && (
            <LinkifiedText text={info.description} className="w-full text-start text-sm leading-6 whitespace-pre-wrap break-words" />
          )}
          <p className="text-xs text-muted-foreground">
            Created <span suppressHydrationWarning>{formatFullDate(info.createdAt, timeZone)}</span>
          </p>
        </section>

        {isAdmin && editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveDetails();
            }}
            className="space-y-4 rounded-2xl border bg-card p-4"
          >
            <div className="space-y-2">
              <Label htmlFor="channel-title">Channel name</Label>
              <Input
                id="channel-title"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={50}
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-description">Description</Label>
              <Textarea
                id="channel-description"
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                maxLength={MAX_CHANNEL_DESCRIPTION}
                rows={3}
                dir="auto"
              />
              <p className="text-end text-xs text-muted-foreground">
                {formatNumber(descriptionDraft.length)}/{formatNumber(MAX_CHANNEL_DESCRIPTION)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={pending} className="h-11 flex-1 rounded-xl text-base">
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                Save
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={() => setEditing(false)} className="h-11 rounded-xl text-base">
                <X />
                Cancel
              </Button>
            </div>
          </form>
        )}

        <MuteSwitch conversationId={info.id} initialMuted={info.muted} />

        {isAdmin && (
          <>
            <section className="space-y-3 rounded-2xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Link2 className="size-4" />
                Invite link
              </h2>
              {link ? (
                <p dir="ltr" className="rounded-xl bg-muted px-3 py-2.5 text-sm break-all select-all">
                  {link}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Create a link that lets anyone with it subscribe.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={() => void copyLink()} className="h-11 rounded-xl text-base">
                  <Copy />
                  {link ? "Copy" : "Create link"}
                </Button>
                <Button variant="outline" size="lg" onClick={() => void shareLink()} className="h-11 rounded-xl text-base">
                  <Share2 />
                  Share
                </Button>
              </div>
              {link && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => setConfirm({ kind: "resetLink" })}
                  className="h-11 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <RefreshCw />
                  Reset link
                </Button>
              )}
            </section>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 py-3.5">
              <Pencil className="size-5 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Sign posts</span>
                <span className="block text-sm text-muted-foreground">Show the posting admin&apos;s name on each post</span>
              </span>
              <Switch checked={info.signMessages} onCheckedChange={toggleSign} aria-label="Sign posts" />
            </label>

            <section className="rounded-2xl border bg-card py-2">
              <h2 className="px-4 py-2 text-sm font-semibold text-muted-foreground">
                Admins · {formatNumber(admins.length)}
              </h2>
              <ul>
                {admins.map((admin) => (
                  <MemberRow key={admin.id} member={admin} onOpen={() => { setSelected(admin); setSheetOpen(true); }} disabled={actionsFor(admin).length === 0} />
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border bg-card py-2">
              <h2 className="px-4 py-2 text-sm font-semibold text-muted-foreground">
                {formatCount(info.memberCount, "subscriber")}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setToAdd([]);
                  setAddOpen(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start font-medium text-link transition-colors hover:bg-muted/60"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10">
                  <UserPlus className="size-5" />
                </span>
                Add subscribers
              </button>
              <div className="relative mx-4 my-2">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4.5 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search subscribers"
                  aria-label="Search subscribers"
                  className="h-11 rounded-xl bg-muted/50 ps-10"
                />
              </div>
              <ul>
                {members.map((member) => (
                  <MemberRow key={member.id} member={member} onOpen={() => { setSelected(member); setSheetOpen(true); }} />
                ))}
              </ul>
              {members.length === 0 && !loadingMembers && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {query ? "No matching subscribers" : "No subscribers yet"}
                </p>
              )}
              {loadingMembers && <Loader2 aria-label="Loading" className="mx-auto my-4 size-5 animate-spin text-muted-foreground" />}
              {nextCursor && !loadingMembers && (
                <Button variant="ghost" onClick={() => void loadMembers(query, nextCursor)} className="mx-auto my-1 flex h-11 rounded-xl">
                  Show more
                </Button>
              )}
            </section>
          </>
        )}

        {info.isOwner && (
          <Button variant="outline" size="lg" onClick={() => setTransferOpen(true)} className="h-12 w-full rounded-xl text-base">
            <Crown />
            Transfer ownership
          </Button>
        )}

        <ConversationDangerZone
          target={{ id: info.id, type: "CHANNEL", title: info.title, myRole: info.myRole, muted: info.muted, isOwner: info.isOwner }}
        />
      </div>

      {/* Member actions */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheetContent>
          {selected && (
            <>
              <SheetHeader className="items-center gap-2 pt-3 text-center">
                <UserAvatar user={selected} size="lg" />
                <SheetTitle className="text-lg font-bold">{selected.name}</SheetTitle>
                <SheetDescription>
                  <bdi dir="ltr">@{selected.username}</bdi>
                  {selected.isOwner && " · Owner"}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <SheetAction icon={<ImageIcon />} label="View photos" onClick={() => void memberPhotos.open(selected.id)} />
                {selectedActions.includes("promote") && (
                  <SheetAction icon={<ShieldCheck />} label="Make admin" onClick={() => setConfirm({ kind: "promote", member: selected })} />
                )}
                {selectedActions.includes("demote") && (
                  <SheetAction icon={<ShieldOff />} label="Remove as admin" onClick={() => setConfirm({ kind: "demote", member: selected })} />
                )}
                {selectedActions.includes("remove") && (
                  <SheetAction icon={<UserMinus />} label="Remove from channel" destructive onClick={() => setConfirm({ kind: "remove", member: selected })} />
                )}
                {selectedActions.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    {selected.isOwner ? "The owner can't be changed or removed." : "Only the owner can change an admin."}
                  </p>
                )}
              </div>
            </>
          )}
        </BottomSheetContent>
      </Sheet>

      {/* Add subscribers */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <BottomSheetContent className="max-h-[85dvh]">
          <SheetHeader className="pt-3">
            <SheetTitle className="text-lg font-bold">Add subscribers</SheetTitle>
            <SheetDescription>Choose from your contacts. Anyone already subscribed is skipped.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <MemberPicker
              contacts={contacts}
              selected={toAdd}
              onToggle={(id) => setToAdd((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))}
            />
          </div>
          <div className="border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button
              size="lg"
              disabled={toAdd.length === 0 || pending}
              onClick={() => act(() => addSubscribers(info.id, toAdd), "Subscribers added", () => setAddOpen(false))}
              className="h-12 w-full rounded-xl text-base"
            >
              {pending && <Loader2 className="animate-spin" />}
              Add {toAdd.length > 0 && `(${formatNumber(toAdd.length)})`}
            </Button>
          </div>
        </BottomSheetContent>
      </Sheet>

      {memberPhotos.element}

      {confirmCopy && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirm}
          destructive={confirmCopy.destructive}
          pending={pending}
          onConfirm={runConfirm}
        />
      )}

      {info.isOwner && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          channelId={info.id}
          admins={admins.filter((admin) => !admin.isOwner)}
          onDone={() => {
            setTransferOpen(false);
            setInfo((current) => ({ ...current, isOwner: false }));
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function MemberRow({ member, onOpen, disabled = false }: { member: ChannelMember; onOpen: () => void; disabled?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-muted/60 disabled:hover:bg-transparent"
      >
        <UserAvatar user={member} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{member.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            <bdi dir="ltr">@{member.username}</bdi>
          </span>
        </span>
        {member.isOwner ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-link">
            <Crown className="size-3" />
            owner
          </span>
        ) : (
          member.role === "ADMIN" && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-link">admin</span>
          )
        )}
      </button>
    </li>
  );
}

function confirmText(confirm: Confirm) {
  switch (confirm.kind) {
    case "promote":
      return { title: "Make admin", description: `Make ${confirm.member.name} an admin of this channel? Admins can post and manage subscribers.`, confirm: "Make admin", destructive: false };
    case "demote":
      return { title: "Remove as admin", description: `Remove ${confirm.member.name} as admin? They stay subscribed.`, confirm: "Remove as admin", destructive: true };
    case "remove":
      return { title: "Remove from channel", description: `Remove ${confirm.member.name} from the channel?`, confirm: "Remove", destructive: true };
    case "resetLink":
      return { title: "Reset invite link?", description: "The current link will stop working immediately and a new one will be created.", confirm: "Reset link", destructive: true };
  }
}

function SheetAction({ icon, label, onClick, destructive = false }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destructive
          ? "flex h-12 items-center gap-3 rounded-xl px-3 text-base text-destructive transition-colors hover:bg-destructive/10 [&_svg]:size-5"
          : "flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors hover:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground"
      }
    >
      {icon}
      {label}
    </button>
  );
}

// Pick one of the other admins and confirm with the owner's password.
function TransferDialog({
  open,
  onOpenChange,
  channelId,
  admins,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  admins: ChannelMember[];
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    startTransition(async () => {
      const result = await transferOwnership(channelId, { newOwnerId: target, password });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Ownership transferred");
      setPassword("");
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPassword("");
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription className="leading-6">
              The new owner can delete the channel and manage admins. You stay an admin.
            </DialogDescription>
          </DialogHeader>
          {admins.length === 0 ? (
            <p className="rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">
              Make someone an admin first, then you can transfer ownership to them.
            </p>
          ) : (
            <>
              <ul className="max-h-56 overflow-y-auto rounded-xl border">
                {admins.map((admin) => (
                  <li key={admin.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={target === admin.id}
                      onClick={() => setTarget(admin.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-muted/60"
                    >
                      <UserAvatar user={admin} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-medium">{admin.name}</span>
                      {target === admin.id && <Check className="size-5 text-link" />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <Label htmlFor="owner-password">Your password</Label>
                <Input
                  id="owner-password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 text-start"
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !target || !password}>
              {pending && <Loader2 className="animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

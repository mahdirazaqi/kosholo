"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, LogOut, MessageCircle, Pencil, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { startDirectConversation } from "@/app/(app)/(tabs)/contacts/actions";
import {
  addMembers,
  deleteGroup,
  leaveGroup,
  removeMember,
  renameGroup,
  setMemberRole,
} from "@/app/(app)/chats/group-actions";
import { BackButton } from "@/components/back-button";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MemberPicker } from "@/components/groups/member-picker";
import { PresenceText } from "@/components/groups/presence-text";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatFullDate } from "@/lib/format-date";
import { getSocket } from "@/lib/realtime/client/socket";
import { subscribePresence } from "@/lib/realtime/client/store";
import type { ConversationRemovedPayload, ConversationUpdatedPayload } from "@/lib/realtime/events";
import type { ChatMember, GroupInfo } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";
import { groupTitleSchema, MAX_GROUP_MEMBERS } from "@/lib/validations/groups";

type Confirm =
  | { kind: "promote" | "demote" | "remove"; member: ChatMember }
  | { kind: "leave" | "delete" };

// Admin-only controls are hidden for members, but every action is checked
// again on the server (group-actions.ts).
export function GroupInfoView({
  initialInfo,
  contacts,
  currentUserId,
}: {
  initialInfo: GroupInfo;
  contacts: PublicUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [info, setInfo] = useState(initialInfo);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(info.title);
  const [selectedMember, setSelectedMember] = useState<ChatMember | null>(null);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, startTransition] = useTransition();

  const me = info.members.find((m) => m.id === currentUserId);
  const isAdmin = me?.role === "ADMIN";
  const members = useMemo(
    () =>
      [...info.members].sort(
        (a, b) =>
          Number(b.id === currentUserId) - Number(a.id === currentUserId) ||
          Number(b.role === "ADMIN") - Number(a.role === "ADMIN") ||
          a.joinedAt.localeCompare(b.joinedAt),
      ),
    [info.members, currentUserId],
  );
  const memberIds = useMemo(() => new Set(info.members.map((m) => m.id)), [info.members]);
  const addable = contacts.filter((c) => !memberIds.has(c.id));

  // Live: title/member/role changes, and being removed.
  useEffect(() => {
    const socket = getSocket();
    const onUpdated = ({ conversationId, title, members: next }: ConversationUpdatedPayload) => {
      if (conversationId !== info.id) return;
      setInfo((current) => ({
        ...current,
        ...(title !== undefined ? { title } : {}),
        ...(next
          ? { members: next, myRole: next.find((m) => m.id === currentUserId)?.role ?? current.myRole }
          : {}),
      }));
    };
    const onRemoved = ({ conversationId, reason }: ConversationRemovedPayload) => {
      if (conversationId !== info.id) return;
      toast.error(reason === "deleted" ? "این گروه حذف شده است" : "شما دیگر عضو این گروه نیستید");
      router.replace("/");
    };
    socket.on("conversation:updated", onUpdated);
    socket.on("conversation:removed", onRemoved);
    return () => {
      socket.off("conversation:updated", onUpdated);
      socket.off("conversation:removed", onRemoved);
    };
  }, [info.id, currentUserId, router]);

  const presenceKey = info.members.map((m) => m.id).filter((id) => id !== currentUserId).join(",");
  useEffect(() => subscribePresence(presenceKey ? presenceKey.split(",") : []), [presenceKey]);

  function act(work: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) return void toast.error(result.error);
      if (success) toast.success(success);
      setConfirm(null);
      setMemberSheetOpen(false);
      after?.();
    });
  }

  function saveTitle() {
    const parsed = groupTitleSchema.safeParse(titleDraft);
    if (!parsed.success) return void toast.error(parsed.error.issues[0].message);
    act(() => renameGroup(info.id, parsed.data), undefined, () => {
      setInfo((current) => ({ ...current, title: parsed.data }));
      setEditing(false);
    });
  }

  function runConfirm() {
    if (!confirm) return;
    switch (confirm.kind) {
      case "promote":
        return act(() => setMemberRole(info.id, confirm.member.id, "ADMIN"), `${confirm.member.name} ادمین شد`);
      case "demote":
        return act(() => setMemberRole(info.id, confirm.member.id, "MEMBER"), `ادمینی ${confirm.member.name} برداشته شد`);
      case "remove":
        return act(() => removeMember(info.id, confirm.member.id), `${confirm.member.name} از گروه حذف شد`);
      case "leave":
        return act(() => leaveGroup(info.id), "از گروه خارج شدید", () => router.replace("/"));
      case "delete":
        return act(() => deleteGroup(info.id), "گروه حذف شد", () => router.replace("/"));
    }
  }

  const confirmCopy = confirm && confirmText(confirm, info.title);

  return (
    <>
      <PageHeader start={<BackButton fallback={`/chats/${info.id}`} />} title="اطلاعات گروه" />

      <div className="space-y-4 px-4 py-6">
        <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
          <UserAvatar user={{ id: info.id, name: info.title, avatarUrl: info.avatarUrl }} size="2xl" />
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveTitle();
              }}
              className="flex w-full max-w-xs items-center gap-2"
            >
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={50}
                autoFocus
                aria-label="نام گروه"
                className="h-11 text-center"
              />
              <Button type="submit" size="icon-lg" aria-label="ذخیره" disabled={pending} className="size-11 shrink-0 rounded-full">
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="انصراف"
                onClick={() => setEditing(false)}
                className="size-11 shrink-0 rounded-full"
              >
                <X />
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <h1 className="text-xl font-bold">{info.title}</h1>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="ویرایش نام گروه"
                  onClick={() => {
                    setTitleDraft(info.title);
                    setEditing(true);
                  }}
                  className="size-9 rounded-full text-muted-foreground"
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {info.members.length.toLocaleString("fa-IR")} عضو · ساخته‌شده در{" "}
            <span suppressHydrationWarning>{formatFullDate(info.createdAt)}</span>
          </p>
        </section>

        <section className="rounded-2xl border bg-card py-2">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {info.members.length.toLocaleString("fa-IR")} عضو
            </h2>
          </div>
          {isAdmin && info.members.length < MAX_GROUP_MEMBERS && (
            <button
              type="button"
              onClick={() => {
                setToAdd([]);
                setAddOpen(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start font-medium text-primary transition-colors hover:bg-muted/60"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10">
                <UserPlus className="size-5" />
              </span>
              افزودن عضو
            </button>
          )}
          <ul>
            {members.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={member.id === currentUserId}
                  onClick={() => {
                    setSelectedMember(member);
                    setMemberSheetOpen(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-muted/60 disabled:hover:bg-transparent"
                >
                  <UserAvatar user={member} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{member.id === currentUserId ? "شما" : member.name}</span>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {member.id === currentUserId ? (
                        <bdi dir="ltr">@{member.username}</bdi>
                      ) : (
                        <>
                          <bdi dir="ltr">@{member.username}</bdi>
                          {" · "}
                          <PresenceText userId={member.id} />
                        </>
                      )}
                    </span>
                  </span>
                  {member.role === "ADMIN" && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      ادمین
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setConfirm({ kind: "leave" })}
            className="h-12 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="rtl:rotate-180" />
            ترک گروه
          </Button>
          {isAdmin && (
            <Button
              variant="destructive"
              size="lg"
              onClick={() => setConfirm({ kind: "delete" })}
              className="h-12 w-full rounded-xl text-base"
            >
              <Trash2 />
              حذف گروه
            </Button>
          )}
        </section>
      </div>

      {/* Member actions */}
      <Sheet open={memberSheetOpen} onOpenChange={setMemberSheetOpen}>
        <BottomSheetContent>
          {selectedMember && (
            <>
              <SheetHeader className="items-center gap-2 pt-3 text-center">
                <UserAvatar user={selectedMember} size="lg" />
                <SheetTitle className="text-lg font-bold">{selectedMember.name}</SheetTitle>
                <SheetDescription>
                  <bdi dir="ltr">@{selectedMember.username}</bdi>
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
                <SheetAction
                  icon={<MessageCircle />}
                  label="ارسال پیام"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await startDirectConversation(selectedMember.id);
                      if (result && !result.ok) toast.error(result.error);
                    })
                  }
                />
                {isAdmin &&
                  (selectedMember.role === "ADMIN" ? (
                    <SheetAction
                      icon={<ShieldOff />}
                      label="حذف ادمینی"
                      onClick={() => setConfirm({ kind: "demote", member: selectedMember })}
                    />
                  ) : (
                    <>
                      <SheetAction
                        icon={<ShieldCheck />}
                        label="ادمین کردن"
                        onClick={() => setConfirm({ kind: "promote", member: selectedMember })}
                      />
                      <SheetAction
                        icon={<UserMinus />}
                        label="حذف از گروه"
                        destructive
                        onClick={() => setConfirm({ kind: "remove", member: selectedMember })}
                      />
                    </>
                  ))}
              </div>
            </>
          )}
        </BottomSheetContent>
      </Sheet>

      {/* Add members */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <BottomSheetContent className="max-h-[85dvh]">
          <SheetHeader className="pt-3">
            <SheetTitle className="text-lg font-bold">افزودن عضو</SheetTitle>
            <SheetDescription>از میان مخاطبینی که عضو گروه نیستند انتخاب کنید.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <MemberPicker
              contacts={addable}
              selected={toAdd}
              max={MAX_GROUP_MEMBERS - info.members.length}
              onToggle={(id) =>
                setToAdd((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
              }
            />
          </div>
          <div className="border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button
              size="lg"
              disabled={toAdd.length === 0 || pending}
              onClick={() =>
                act(() => addMembers(info.id, toAdd), "اعضا اضافه شدند", () => setAddOpen(false))
              }
              className="h-12 w-full rounded-xl text-base"
            >
              {pending && <Loader2 className="animate-spin" />}
              افزودن {toAdd.length > 0 && `(${toAdd.length.toLocaleString("fa-IR")})`}
            </Button>
          </div>
        </BottomSheetContent>
      </Sheet>

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
    </>
  );
}

function confirmText(confirm: Confirm, title: string) {
  switch (confirm.kind) {
    case "promote":
      return { title: "ادمین کردن", description: `${confirm.member.name} ادمین گروه شود؟`, confirm: "ادمین کردن", destructive: false };
    case "demote":
      return { title: "حذف ادمینی", description: `ادمینی ${confirm.member.name} برداشته شود؟`, confirm: "حذف ادمینی", destructive: true };
    case "remove":
      return { title: "حذف از گروه", description: `${confirm.member.name} از گروه حذف شود؟`, confirm: "حذف", destructive: true };
    case "leave":
      return { title: "ترک گروه", description: `از گروه «${title}» خارج می‌شوید؟`, confirm: "ترک گروه", destructive: true };
    case "delete":
      return {
        title: "حذف گروه",
        description: `گروه «${title}» و همهٔ پیام‌هایش برای همهٔ اعضا برای همیشه حذف می‌شود. این کار قابل بازگشت نیست.`,
        confirm: "حذف برای همه",
        destructive: true,
      };
  }
}

function SheetAction({
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

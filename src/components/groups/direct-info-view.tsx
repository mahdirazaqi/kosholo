"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addContact, removeContact } from "@/app/(app)/(tabs)/contacts/actions";
import { BackButton } from "@/components/back-button";
import { ConversationDangerZone } from "@/components/chat/conversation-actions";
import { MuteSwitch } from "@/components/chat/mute-switch";
import { PresenceText } from "@/components/groups/presence-text";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { usePresence } from "@/hooks/use-presence";
import { getSocket } from "@/lib/realtime/client/socket";
import { isLocalDelete } from "@/lib/realtime/client/store";
import type { ConversationDeletedPayload } from "@/lib/realtime/events";
import type { PublicUser } from "@/lib/users";

export function DirectInfoView({
  conversationId,
  user,
  initialIsContact,
  muted,
}: {
  conversationId: string;
  user: PublicUser;
  initialIsContact: boolean;
  muted: boolean;
}) {
  usePresence(user.id);
  const router = useRouter();

  // Deleted for everyone by the other person (or from another tab).
  useEffect(() => {
    const socket = getSocket();
    const onDeleted = ({ conversationId: id }: ConversationDeletedPayload) => {
      if (id !== conversationId) return;
      if (!isLocalDelete(id)) toast("This chat was deleted");
      router.replace("/");
    };
    socket.on("conversation:deleted", onDeleted);
    return () => void socket.off("conversation:deleted", onDeleted);
  }, [conversationId, router]);
  const [isContact, setIsContact] = useState(initialIsContact);
  const [pending, startTransition] = useTransition();

  function toggleContact() {
    startTransition(async () => {
      const result = isContact ? await removeContact(user.id) : await addContact(user.id);
      if (!result.ok) return void toast.error(result.error);
      setIsContact(!isContact);
      toast.success(isContact ? `${user.name} removed from contacts` : `${user.name} added to contacts`);
    });
  }

  return (
    <>
      <PageHeader start={<BackButton />} title="Contact info" />
      <div className="space-y-4 px-4 py-6">
        <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
          <UserAvatar user={user} size="2xl" />
          <div className="space-y-1">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">
              <bdi dir="ltr">@{user.username}</bdi>
            </p>
            <p className="text-sm text-muted-foreground">
              <PresenceText userId={user.id} />
            </p>
          </div>
        </section>
        <Button
          variant="outline"
          size="lg"
          onClick={toggleContact}
          disabled={pending}
          className={
            isContact
              ? "h-12 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "h-12 w-full rounded-xl text-base"
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : isContact ? <UserMinus /> : <UserPlus />}
          {isContact ? "Remove from contacts" : "Add to contacts"}
        </Button>
        <MuteSwitch conversationId={conversationId} initialMuted={muted} />
        <ConversationDangerZone target={{ id: conversationId, type: "DIRECT", title: user.name, myRole: "MEMBER", muted }} />
      </div>
    </>
  );
}

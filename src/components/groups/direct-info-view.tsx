"use client";

import { useState, useTransition } from "react";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addContact, removeContact } from "@/app/(app)/(tabs)/contacts/actions";
import { BackButton } from "@/components/back-button";
import { PresenceText } from "@/components/groups/presence-text";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { usePresence } from "@/hooks/use-presence";
import type { PublicUser } from "@/lib/users";

export function DirectInfoView({ user, initialIsContact }: { user: PublicUser; initialIsContact: boolean }) {
  usePresence(user.id);
  const [isContact, setIsContact] = useState(initialIsContact);
  const [pending, startTransition] = useTransition();

  function toggleContact() {
    startTransition(async () => {
      const result = isContact ? await removeContact(user.id) : await addContact(user.id);
      if (!result.ok) return void toast.error(result.error);
      setIsContact(!isContact);
      toast.success(isContact ? `${user.name} از مخاطبین حذف شد` : `${user.name} به مخاطبین اضافه شد`);
    });
  }

  return (
    <>
      <PageHeader start={<BackButton />} title="اطلاعات مخاطب" />
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
          {isContact ? "حذف از مخاطبین" : "افزودن به مخاطبین"}
        </Button>
      </div>
    </>
  );
}

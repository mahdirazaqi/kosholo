"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { startDirectConversation } from "@/app/(app)/(tabs)/contacts/actions";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PublicUser } from "@/lib/users";

export function NewChatSheet({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: PublicUser[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <SheetHeader className="pt-3">
          <SheetTitle className="text-lg font-bold">گفتگوی جدید</SheetTitle>
          <SheetDescription>یکی از مخاطبین خود را انتخاب کنید.</SheetDescription>
        </SheetHeader>
        <div className="px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {contacts.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
              <Users className="size-10 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">هنوز مخاطبی ندارید</p>
              <Button asChild size="lg" className="h-11 rounded-xl px-5 text-base">
                <Link href="/contacts" onClick={() => onOpenChange(false)}>
                  افزودن مخاطب
                </Link>
              </Button>
            </div>
          ) : (
            <ul>
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <ContactRow contact={contact} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </BottomSheetContent>
    </Sheet>
  );
}

function ContactRow({ contact }: { contact: PublicUser }) {
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result = await startDirectConversation(contact.id);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted disabled:opacity-70"
    >
      <UserAvatar user={contact} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{contact.name}</span>
        <span className="block truncate text-sm text-muted-foreground">
          <bdi dir="ltr">@{contact.username}</bdi>
        </span>
      </span>
      {pending && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
    </button>
  );
}

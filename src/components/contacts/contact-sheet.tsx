"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { removeContact, startDirectConversation } from "@/app/(app)/(tabs)/contacts/actions";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PublicUser } from "@/lib/users";

export function ContactSheet({
  contact,
  open,
  onOpenChange,
}: {
  contact: PublicUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        {contact && <ContactDetails key={contact.id} contact={contact} />}
      </BottomSheetContent>
    </Sheet>
  );
}

function ContactDetails({ contact }: { contact: PublicUser }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [messagePending, startMessage] = useTransition();
  const [removePending, startRemove] = useTransition();

  function sendMessage() {
    startMessage(async () => {
      // Redirects to the conversation on success.
      const result = await startDirectConversation(contact.id);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await removeContact(contact.id);
      if (result.ok) {
        setConfirmOpen(false);
        toast.success(`${contact.name} removed from contacts`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <SheetHeader className="items-center gap-3 pt-4 text-center">
        <UserAvatar user={contact} size="xl" />
        <div className="space-y-1">
          <SheetTitle className="text-lg font-bold">{contact.name}</SheetTitle>
          <SheetDescription dir="ltr">@{contact.username}</SheetDescription>
        </div>
      </SheetHeader>

      <div className="space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button
          size="lg"
          onClick={sendMessage}
          disabled={messagePending}
          className="h-12 w-full rounded-xl text-base"
        >
          {messagePending ? <Loader2 className="animate-spin" /> : <MessageCircle />}
          Send message
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setConfirmOpen(true)}
          className="h-12 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <UserMinus />
          Remove from contacts
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove contact</DialogTitle>
            <DialogDescription>
              {contact.name} will be removed from your contacts. Your existing chats will stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="lg" className="h-11 rounded-xl text-base">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="lg"
              onClick={remove}
              disabled={removePending}
              className="h-11 rounded-xl text-base"
            >
              {removePending && <Loader2 className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

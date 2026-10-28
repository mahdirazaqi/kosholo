"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { clearBadges } from "@/lib/pwa/badges";
import { clearAppCaches } from "@/lib/pwa/caches";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LogoutButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className="h-11 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="rtl:rotate-180" />
          Log out
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Log out</DialogTitle>
          <DialogDescription>Are you sure you want to log out?</DialogDescription>
        </DialogHeader>
        <form
          action={async () => {
            // Nothing from this account may stay on the device.
            clearBadges();
            await clearAppCaches();
            await logout();
          }}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="lg" className="h-11 rounded-xl text-base">
                Cancel
              </Button>
            </DialogClose>
            <LogoutSubmit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogoutSubmit() {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending} variant="destructive" className="sm:w-auto">
      Log out
    </SubmitButton>
  );
}

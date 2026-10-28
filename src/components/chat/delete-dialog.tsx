"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const IRREVERSIBLE = "This can't be undone.";

// Telegram-style confirm for every deletion: a warning that it's permanent and,
// when the user may do it, an "also for …" checkbox (unchecked by default).
export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  everyoneLabel,
  confirmLabel = "Delete",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  // Shown only when deleting for everyone is allowed.
  everyoneLabel?: string | null;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: (forEveryone: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DeleteDialogBody
          title={title}
          description={description}
          everyoneLabel={everyoneLabel}
          confirmLabel={confirmLabel}
          pending={pending}
          onConfirm={onConfirm}
        />
      )}
    </Dialog>
  );
}

// Mounted per opening, so the checkbox starts unchecked every time.
function DeleteDialogBody({
  title,
  description,
  everyoneLabel,
  confirmLabel,
  pending,
  onConfirm,
}: {
  title: string;
  description?: React.ReactNode;
  everyoneLabel?: string | null;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (forEveryone: boolean) => void;
}) {
  const [forEveryone, setForEveryone] = useState(false);
  const checkboxId = useId();
  return (
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="leading-6">
          {description ? <>{description} </> : null}
          {IRREVERSIBLE}
        </DialogDescription>
      </DialogHeader>
      {everyoneLabel && (
        <label
          htmlFor={checkboxId}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-base"
        >
          <Checkbox
            id={checkboxId}
            checked={forEveryone}
            onCheckedChange={(checked) => setForEveryone(checked === true)}
          />
          <span className="min-w-0">{everyoneLabel}</span>
        </label>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="lg" className="h-11 rounded-xl text-base">
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="destructive"
          size="lg"
          disabled={pending}
          onClick={() => onConfirm(forEveryone)}
          className="h-11 rounded-xl text-base"
        >
          {pending && <Loader2 className="animate-spin" />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

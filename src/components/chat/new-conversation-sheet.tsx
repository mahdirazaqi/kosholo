"use client";

import Link from "next/link";
import { ChevronRight, Megaphone, MessageCircle, Users } from "lucide-react";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// "New chat" (contact picker), "New group" (/chats/new-group) or "New channel"
// (/chats/new-channel).
export function NewConversationSheet({
  open,
  onOpenChange,
  onNewChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <SheetHeader className="pt-3">
          <SheetTitle className="text-lg font-bold">Start a chat</SheetTitle>
          <SheetDescription className="sr-only">Choose the type of chat</SheetDescription>
        </SheetHeader>
        <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Option
            icon={<MessageCircle />}
            title="New chat"
            description="Private message to a contact"
            onClick={onNewChat}
          />
          <Option
            icon={<Users />}
            title="New group"
            description="Chat with several contacts"
            href="/chats/new-group"
            onClick={() => onOpenChange(false)}
          />
          <Option
            icon={<Megaphone />}
            title="New channel"
            description="Publish posts to subscribers"
            href="/chats/new-channel"
            onClick={() => onOpenChange(false)}
          />
        </div>
      </BottomSheetContent>
    </Sheet>
  );
}

function Option({
  icon,
  title,
  description,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick: () => void;
}) {
  const className =
    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted";
  const content = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-link [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground rtl:rotate-180" />
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

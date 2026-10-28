"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Smile } from "lucide-react";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";

// The picker (frimousse + its data) loads on first open.
const Picker = dynamic(() => import("@/components/chat/emoji-picker-panel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-80 max-w-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ),
});

export function EmojiButton({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  // Called after the picker closes so the composer can take focus back.
  onClose: () => void;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label="Emoji"
      className="size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
    >
      <Smile className="size-6" />
    </Button>
  );

  if (isDesktop) {
    // Stays open for several picks.
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-auto overflow-hidden p-0"
          // The textarea keeps focus while picking: don't move focus into the
          // picker on open, and stop mouse clicks on emoji from stealing it
          // (the search box can still be clicked and typed in).
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
          }}
          onFocusOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClose();
          }}
        >
          <Picker className="h-[360px]" columns={9} onPick={onPick} />
        </PopoverContent>
      </Popover>
    );
  }

  // Mobile: bottom sheet, closes after a pick and returns focus to the textarea.
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <BottomSheetContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <SheetTitle className="sr-only">Choose emoji</SheetTitle>
        <div className="px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <Picker
            className="mx-auto h-[min(380px,55dvh)]"
            columns={8}
            onPick={(emoji) => {
              onPick(emoji);
              setOpen(false);
            }}
          />
        </div>
      </BottomSheetContent>
    </Sheet>
  );
}

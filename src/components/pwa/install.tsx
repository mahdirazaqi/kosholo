"use client";

import { useState } from "react";
import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dismissInstallBanner, promptInstall, useInstallState } from "@/lib/pwa/install";

// Runs the native prompt (Chrome/Edge/Android) or opens the iOS instructions.
function useInstallAction() {
  const state = useInstallState();
  const [iosOpen, setIosOpen] = useState(false);
  const install = () => (state.canPrompt ? void promptInstall() : setIosOpen(true));
  const sheet = <IosInstallSheet open={iosOpen} onOpenChange={setIosOpen} />;
  return { state, install, sheet };
}

// Top of the chat list; dismissible for 14 days.
export function InstallBanner() {
  const { state, install, sheet } = useInstallAction();
  if (!state.available || state.dismissed || !state.engaged) return sheet;

  return (
    <>
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-xs">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Smartphone className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">Install the app on your phone</p>
        <Button size="sm" onClick={install} className="h-9 rounded-lg px-3">
          Install
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss install suggestion"
          onClick={dismissInstallBanner}
          className="size-9 rounded-full text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
      {sheet}
    </>
  );
}

// Permanent settings row (no dismissal).
export function InstallSettingsRow() {
  const { state, install, sheet } = useInstallAction();
  if (!state.available) return null;
  return (
    <>
      <button
        type="button"
        onClick={install}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-base transition-colors hover:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground"
      >
        <Download />
        Install app
      </button>
      {sheet}
    </>
  );
}

function IosInstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = [
    { icon: <Share />, text: "In Safari, tap the Share button in the bottom bar (at the top on iPad)." },
    { icon: <PlusSquare />, text: "Choose \"Add to Home Screen\"." },
    { icon: <Smartphone />, text: "Tap \"Add\". Kosholo appears on your Home Screen like any other app." },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <SheetHeader className="pt-3">
          <SheetTitle className="text-lg font-bold">Install on iPhone</SheetTitle>
          <SheetDescription>Three quick steps:</SheetDescription>
        </SheetHeader>
        <ol className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-link [&_svg]:size-5">
                {step.icon}
              </span>
              <p className="pt-2 text-sm leading-6">
                <span className="font-bold">{index + 1}. </span>
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </BottomSheetContent>
    </Sheet>
  );
}

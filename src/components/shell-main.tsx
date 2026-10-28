"use client";

import { useRef } from "react";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";

// AppShell's scroll area: remembers its scroll position per page.
export function ShellMain({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useScrollRestoration(ref);
  return (
    <main
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]"
    >
      {children}
    </main>
  );
}

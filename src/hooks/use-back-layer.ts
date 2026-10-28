"use client";

import { useEffect, useRef } from "react";
import { closeWithEscape, pushLayer } from "@/lib/back-stack";

// While `open`, the layer sits on the back stack: Android back / browser back
// calls `onClose` (default: Escape, which every Radix layer understands)
// instead of leaving the page.
export function useBackLayer(open: boolean, onClose: () => void = closeWithEscape) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    return pushLayer(() => close.current());
  }, [open]);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { takeHighlight } from "@/lib/settings/highlight";
import { cn } from "@/lib/utils";

const BAR_HEIGHT = 44; // px, below the safe area

// The page frame of every settings screen: grouped background, a top bar
// (back button with the previous page's title, a small centred title that fades
// in when the large title scrolls away, and start/end actions), the large title,
// an optional search slot, and the content in a column (centred, ≤640px on
// desktop). The collapse is an IntersectionObserver toggling opacity: no scroll
// handler and nothing but transform/opacity moves.
export function SettingsPage({
  title,
  backLabel,
  backHref = "/settings",
  largeTitle = true,
  start,
  end,
  search,
  children,
}: {
  title: string;
  backLabel?: string; // the previous page's title; shows the back button
  backHref?: string;
  largeTitle?: boolean; // false: the title always sits in the bar (the root page)
  start?: React.ReactNode; // replaces the back button (e.g. Cancel)
  end?: React.ReactNode;
  search?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const sentinel = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(!largeTitle);

  useEffect(() => {
    if (!largeTitle) return;
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      rootMargin: `-${BAR_HEIGHT + 4}px 0px 0px 0px`,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [largeTitle]);

  // Coming from a search result: scroll to the row and flash it.
  useEffect(() => {
    const id = takeHighlight();
    if (!id) return;
    let frame = 0;
    let tries = 0;
    const find = () => {
      const row = document.querySelector<HTMLElement>(`[data-setting="${CSS.escape(id)}"]`);
      if (!row) {
        if (tries++ < 40) frame = requestAnimationFrame(find);
        return;
      }
      row.scrollIntoView({ block: "center", behavior: "auto" });
      row.classList.add("setting-highlight");
      setTimeout(() => row.classList.remove("setting-highlight"), 1700);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-full bg-grouped-bg">
      <header className="sticky top-0 z-20 bg-grouped-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-11 w-full max-w-[640px] items-center px-2">
          <div className="relative z-10 flex min-w-0 flex-1 items-center justify-start">
            {start ??
              (backLabel && (
                <button
                  type="button"
                  onClick={() => (window.history.length > 1 ? router.back() : router.push(backHref))}
                  className="flex min-h-11 min-w-11 items-center gap-0.5 rounded-lg pe-3 text-[17px] text-link"
                >
                  <ChevronLeft className="size-7 rtl:rotate-180" strokeWidth={2.25} />
                  <span className="max-w-[30vw] truncate">{backLabel}</span>
                </button>
              ))}
          </div>
          <h1
            aria-hidden={!collapsed}
            className={cn(
              "pointer-events-none absolute inset-x-24 text-center text-[17px] font-semibold transition-opacity duration-150",
              "truncate",
              collapsed ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </h1>
          <div className="relative z-10 flex min-w-0 flex-1 items-center justify-end">{end}</div>
        </div>
        <div
          aria-hidden
          className={cn("absolute inset-x-0 bottom-0 h-px bg-grouped-separator transition-opacity duration-150", collapsed ? "opacity-100" : "opacity-0")}
        />
      </header>

      <div className="mx-auto w-full max-w-[640px] px-4 pb-[max(env(safe-area-inset-bottom),2rem)]">
        {largeTitle && (
          <h1 ref={sentinel} className="pt-1 pb-3 ps-1 text-[34px] leading-[1.15] font-bold tracking-tight">
            {title}
          </h1>
        )}
        {search}
        <div className={cn(!largeTitle && "pt-2")}>{children}</div>
      </div>
    </div>
  );
}

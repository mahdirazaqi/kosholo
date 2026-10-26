"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConversationList, NewConversationLauncher } from "@/components/chat/chat-list-view";
import { InstallBanner } from "@/components/pwa/install";
import { isTabActive, NAV_TABS, UnreadBadge } from "@/components/bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeStore } from "@/lib/realtime/client/store";
import { cn } from "@/lib/utils";

// Desktop (≥1024px) sidebar: icon tabs + the live chat list. It lives in the
// (app) layout, so it stays mounted (no reload, no scroll reset) while the
// main pane switches chats. Reads the list from the realtime store, which the
// RealtimeProvider loads on start.
export function DesktopSidebar() {
  const pathname = usePathname();
  const conversations = useRealtimeStore((state) => state.conversations);
  const me = useRealtimeStore((state) => state.me);
  const selectedId = pathname.match(/^\/chats\/([0-9a-f-]{36})/)?.[1] ?? null;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span className="flex-1 text-lg font-bold">کوشولو</span>
        <nav aria-label="بخش‌های اصلی" className="flex items-center gap-1">
          {NAV_TABS.map(({ href, label, icon: Icon, unread }) => {
            const active = isTabActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "bg-primary/10 text-foreground dark:bg-primary/15" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {unread && <UnreadBadge className="absolute -top-0.5 -end-0.5" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <InstallBanner />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {conversations === null ? (
          <SidebarListSkeleton />
        ) : (
          <ConversationList conversations={conversations} currentUserId={me} selectedId={selectedId} />
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        <NewConversationLauncher variant="sidebar" />
      </div>
    </>
  );
}

export function SidebarListSkeleton() {
  return (
    <div className="space-y-1 px-2 py-2" aria-hidden>
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-3">
          <Skeleton className="size-13 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

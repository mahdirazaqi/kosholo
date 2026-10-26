"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, UserRound, Users } from "lucide-react";
import { toFaDigits } from "@/lib/digits";
import { selectTotalUnread, useRealtimeStore } from "@/lib/realtime/client/store";
import { cn } from "@/lib/utils";

// Shared by the mobile bottom nav and the desktop sidebar tabs.
export const NAV_TABS = [
  { href: "/", label: "گفتگوها", icon: MessageCircle, unread: true },
  { href: "/contacts", label: "مخاطبین", icon: Users, unread: false },
  { href: "/profile", label: "پروفایل", icon: UserRound, unread: false },
] as const;

export function isTabActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/chats") : pathname.startsWith(href);
}

export function UnreadBadge({ className }: { className?: string }) {
  const total = useRealtimeStore(selectTotalUnread);
  if (total === 0) return null;
  return (
    <span
      aria-label={`${toFaDigits(total)} پیام خوانده‌نشده`}
      className={cn(
        "flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background",
        className,
      )}
    >
      {total > 99 ? "+۹۹" : toFaDigits(total)}
    </span>
  );
}

// Mobile/tablet only; on desktop the sidebar has the tabs.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="بخش‌های اصلی"
      className="shrink-0 border-t bg-background/80 pb-[env(safe-area-inset-bottom)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] backdrop-blur lg:hidden"
    >
      <ul className="grid h-16 grid-cols-3">
        {NAV_TABS.map(({ href, label, icon: Icon, unread }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10 dark:bg-primary/15",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  {unread && <UnreadBadge className="absolute -top-1.5 end-2" />}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

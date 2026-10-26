"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "گفتگوها", icon: MessageCircle },
  { href: "/contacts", label: "مخاطبین", icon: Users },
  { href: "/profile", label: "پروفایل", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 border-t bg-background/80 pb-[env(safe-area-inset-bottom)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] backdrop-blur">
      <ul className="grid h-16 grid-cols-3">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10 dark:bg-primary/15",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
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

import { Suspense } from "react";
import { CurrentUserBootstrap } from "@/components/current-user-bootstrap";
import { DesktopSidebar, SidebarListSkeleton } from "@/components/desktop-sidebar";
import { RealtimeProvider } from "@/components/realtime-provider";
import { getCurrentUser } from "@/lib/auth";

// Everything signed-in shares one socket connection. On desktop (≥1024px) the
// sidebar with the chat list sits here, so it persists across navigations;
// the tabs/chats layouts below render the main pane. Phones and tablets only
// see the main pane (single-column navigation).
export default function SignedInLayout({ children }: LayoutProps<"/">) {
  return (
    <RealtimeProvider>
      <Suspense>
        <CurrentUser />
      </Suspense>
      <div className="lg:flex lg:h-dvh lg:overflow-hidden">
        <aside
          aria-label="Chat list"
          className="hidden h-dvh w-[360px] shrink-0 flex-col border-e bg-background lg:flex"
        >
          {/* usePathname() needs a boundary on dynamic routes under Cache Components. */}
          <Suspense fallback={<SidebarListSkeleton />}>
            <DesktopSidebar />
          </Suspense>
        </aside>
        <div className="min-w-0 lg:flex-1">{children}</div>
      </div>
    </RealtimeProvider>
  );
}

async function CurrentUser() {
  const user = await getCurrentUser();
  return user ? <CurrentUserBootstrap userId={user.id} /> : null;
}

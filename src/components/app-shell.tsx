import { BottomNav } from "@/components/bottom-nav";
import { EdgeSwipeBack } from "@/components/edge-swipe-back";
import { ShellMain } from "@/components/shell-main";

// Each page renders its own <PageHeader /> at the top of the scroll area.
// Phones: full screen. Tablets: a centered card. Desktop (≥1024px): the main
// pane next to the sidebar (src/app/(app)/layout.tsx), without the bottom nav.
// `swipeBack`: sub-pages get the iOS-style edge swipe to go back (phones).
export function AppShell({
  children,
  nav = false,
  swipeBack = false,
}: {
  children: React.ReactNode;
  nav?: boolean;
  swipeBack?: boolean;
}) {
  return (
    <div className="bg-muted/40 md:py-6 lg:bg-background lg:p-0">
      <div
        data-swipe-shell
        className="relative mx-auto flex h-[var(--app-height,100dvh)] w-full max-w-md flex-col overflow-hidden bg-background md:h-[calc(100dvh-3rem)] md:rounded-3xl md:border md:shadow-sm lg:h-dvh lg:max-w-none lg:rounded-none lg:border-0 lg:shadow-none"
      >
        <ShellMain>{children}</ShellMain>

        {nav && <BottomNav />}
        {swipeBack && <EdgeSwipeBack />}
      </div>
    </div>
  );
}

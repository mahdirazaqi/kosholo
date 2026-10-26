import { BottomNav } from "@/components/bottom-nav";

// Each page renders its own <PageHeader /> at the top of the scroll area.
// Phones: full screen. Tablets: a centered card. Desktop (≥1024px): the main
// pane next to the sidebar (src/app/(app)/layout.tsx), without the bottom nav.
export function AppShell({ children, nav = false }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <div className="bg-muted/40 md:py-6 lg:bg-background lg:p-0">
      <div className="relative mx-auto flex h-[var(--app-height,100dvh)] w-full max-w-md flex-col overflow-hidden bg-background md:h-[calc(100dvh-3rem)] md:rounded-3xl md:border md:shadow-sm lg:h-dvh lg:max-w-none lg:rounded-none lg:border-0 lg:shadow-none">
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]">
          {children}
        </main>

        {nav && <BottomNav />}
      </div>
    </div>
  );
}

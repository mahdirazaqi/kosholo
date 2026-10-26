import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 md:py-6">
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background md:h-[calc(100dvh-3rem)] md:rounded-3xl md:border md:shadow-sm">
        <header className="shrink-0 border-b bg-background/80 pt-[env(safe-area-inset-top)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] backdrop-blur">
          <div className="flex h-14 items-center px-5">
            <span className="text-lg font-bold tracking-tight">کشولو</span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]">
          {children}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

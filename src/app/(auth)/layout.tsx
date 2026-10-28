import { MessageCircle } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),2.5rem)] ps-[max(env(safe-area-inset-left),1rem)] pe-[max(env(safe-area-inset-right),1rem)]">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/10">
            <MessageCircle className="size-7" strokeWidth={1.75} />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">Kosholo</span>
        </div>
        {children}
      </div>
    </div>
  );
}

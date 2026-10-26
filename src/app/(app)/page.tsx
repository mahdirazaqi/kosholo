import { MessageCircle } from "lucide-react";
import { PingButton, SocketStatusBadge } from "@/components/socket-status";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/10">
          <MessageCircle className="size-10" strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">کوشولو</h1>
          <p className="text-sm leading-7 text-muted-foreground">
            پیام‌رسانی سبک، سریع و ساده برای گفتگو با دوستان
          </p>
        </div>
        <SocketStatusBadge />
      </div>

      <div className="w-full max-w-xs space-y-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">آزمایش اتصال</h2>
          <p className="text-xs leading-6 text-muted-foreground">
            یک پیام «ping» به سرور بفرستید و پاسخ را دریافت کنید.
          </p>
        </div>
        <PingButton />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/hooks/use-socket";
import { cn } from "@/lib/utils";

export function SocketStatusBadge() {
  const { connected } = useSocket();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        connected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-muted-foreground/60",
          )}
        />
      </span>
      {connected ? "متصل" : "قطع"}
    </span>
  );
}

export function PingButton() {
  const { socket, connected } = useSocket();
  const [pending, setPending] = useState(false);

  function sendPing() {
    setPending(true);
    const startedAt = performance.now();
    socket().timeout(3000).emit("ping", (error: Error | null, response: string) => {
      setPending(false);
      if (error) {
        toast.error("پاسخی از سرور دریافت نشد");
        return;
      }
      const ms = Math.round(performance.now() - startedAt);
      toast.success(`پاسخ سرور: ${response}`, {
        description: `زمان رفت و برگشت: ${ms.toLocaleString("fa-IR")} میلی‌ثانیه`,
      });
    });
  }

  return (
    <Button
      size="lg"
      className="w-full rounded-xl"
      onClick={sendPing}
      disabled={!connected || pending}
    >
      <Radio />
      ارسال پینگ
    </Button>
  );
}

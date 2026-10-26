import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        <SearchX className="size-8" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold">صفحه پیدا نشد</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          این صفحه وجود ندارد یا به آن دسترسی ندارید.
        </p>
      </div>
      <Button asChild size="lg" className="h-11 rounded-xl px-5 text-base">
        <Link href="/">بازگشت به خانه</Link>
      </Button>
    </div>
  );
}

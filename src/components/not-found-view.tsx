import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function NotFoundView() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="صفحه پیدا نشد"
      description="این صفحه وجود ندارد یا به آن دسترسی ندارید."
      className="min-h-dvh lg:min-h-full"
      action={
        <Button asChild size="lg" className="h-11 rounded-xl px-5 text-base">
          <Link href="/">بازگشت به خانه</Link>
        </Button>
      }
    />
  );
}

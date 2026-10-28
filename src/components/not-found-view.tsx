import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function NotFoundView() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Page not found"
      description="This page doesn't exist or you don't have access to it."
      className="min-h-dvh lg:min-h-full"
      action={
        <Button asChild size="lg" className="h-11 rounded-xl px-5 text-base">
          <Link href="/">Back to home</Link>
        </Button>
      }
    />
  );
}

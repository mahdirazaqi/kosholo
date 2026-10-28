"use client";

import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// Shared by app/error.tsx and app/(app)/error.tsx.
export function ErrorView({ reset }: { reset: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Something went wrong"
      description="This section couldn't be loaded. Please try again."
      className="min-h-dvh lg:min-h-full"
      action={
        <div className="flex gap-2">
          <Button size="lg" onClick={reset} className="h-11 rounded-xl px-5 text-base">
            <RotateCw />
            Try again
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 rounded-xl px-5 text-base">
            <Link href="/">Home</Link>
          </Button>
        </div>
      }
    />
  );
}

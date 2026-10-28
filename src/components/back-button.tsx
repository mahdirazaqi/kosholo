"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Goes back in history when there is somewhere to go back to, otherwise to `fallback`.
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Back"
      className="-ms-2 rounded-full"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >
      <ChevronLeft className="size-6 rtl:rotate-180" />
    </Button>
  );
}

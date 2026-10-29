import type { Metadata } from "next";
import { Suspense } from "react";
import { AppearanceSettings } from "@/components/appearance/appearance-settings";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Appearance | Kosholo" };

export default function AppearancePage() {
  return (
    <>
      <PageHeader start={<BackButton fallback="/profile" />} title="Appearance" />
      {/* Reading the session is request-time data, so it streams in. */}
      <Suspense
        fallback={
          <div className="space-y-4 px-4 pt-4">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireUser();
  return <AppearanceSettings />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AppearanceSettings } from "@/components/appearance/appearance-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Appearance | Kosholo" };

export default function AppearancePage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <AppearanceSettings />;
}

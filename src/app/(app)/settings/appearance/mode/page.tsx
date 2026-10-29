import type { Metadata } from "next";
import { Suspense } from "react";
import { DisplayModeSettings } from "@/components/appearance/appearance-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Display mode | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <DisplayModeSettings />;
}

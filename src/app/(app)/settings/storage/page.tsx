import type { Metadata } from "next";
import { Suspense } from "react";
import { StorageSettings } from "@/components/settings/storage-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Data & Storage | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <StorageSettings />;
}

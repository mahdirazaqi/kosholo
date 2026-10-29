import type { Metadata } from "next";
import { Suspense } from "react";
import { PrivacySettings } from "@/components/settings/privacy-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Privacy & Security | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <PrivacySettings />;
}

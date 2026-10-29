import type { Metadata } from "next";
import { Suspense } from "react";
import { AboutSettings } from "@/components/settings/about-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import pkg from "@/../package.json";

export const metadata: Metadata = { title: "About | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <AboutSettings version={pkg.version} />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordSettings } from "@/components/settings/password-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Change password | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <PasswordSettings />;
}

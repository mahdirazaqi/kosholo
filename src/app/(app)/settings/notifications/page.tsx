import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Notifications & Sounds | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireUser();
  return <NotificationsSettings />;
}

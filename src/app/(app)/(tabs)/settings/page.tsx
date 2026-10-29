import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsRoot } from "@/components/settings/settings-root";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import { getProfilePhotos } from "@/lib/profile-photos";
import pkg from "@/../package.json";

export const metadata: Metadata = { title: "Settings | Kosholo" };

export default function SettingsPage() {
  return (
    // Reading the session is request-time data, so it streams in.
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const photos = (await getProfilePhotos(user.id, user.id)) ?? [];
  return (
    <SettingsRoot
      user={{ id: user.id, name: user.name, username: user.username, email: user.email, avatarUrl: user.avatarUrl }}
      initialPhotos={photos}
      version={pkg.version}
    />
  );
}

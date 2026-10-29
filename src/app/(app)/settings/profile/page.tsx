import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileEdit } from "@/components/settings/profile-edit";
import { SettingsPageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import { getProfilePhotos } from "@/lib/profile-photos";

export const metadata: Metadata = { title: "Edit profile | Kosholo" };

export default function Page() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const photos = (await getProfilePhotos(user.id, user.id)) ?? [];
  return (
    <ProfileEdit
      user={{ id: user.id, name: user.name, username: user.username, email: user.email, avatarUrl: user.avatarUrl }}
      initialPhotos={photos}
    />
  );
}

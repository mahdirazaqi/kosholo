import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileSkeleton } from "@/components/skeletons";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { EditNameForm } from "@/components/profile/edit-name-form";
import { LogoutButton } from "@/components/profile/logout-button";
import { PageHeader } from "@/components/page-header";
import { setProfilePhoto } from "@/app/(app)/photo-actions";
import { AvatarEditor } from "@/components/avatar-editor";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";
import { SettingsSection } from "@/components/profile/settings-section";
import pkg from "@/../package.json";

export const metadata: Metadata = { title: "Profile | Kosholo" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" />
      <div className="space-y-4 px-4 py-6">
        {/* Reading the session is request-time data, so it streams in. */}
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent />
        </Suspense>
        {/* No prefetch: opening it creates the conversation the first time. */}
        <Link
          href="/saved"
          prefetch={false}
          className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bookmark className="size-5 fill-current" />
          </span>
          <span className="min-w-0 flex-1 font-semibold">Saved Messages</span>
          <ChevronRight className="size-5 text-muted-foreground rtl:rotate-180" />
        </Link>
        <SettingsSection version={pkg.version} />
        <Section title="Log out" description="Log out of your account on this device.">
          <LogoutButton />
        </Section>
      </div>
    </>
  );
}

async function ProfileContent() {
  const user = await requireUser();

  return (
    <>
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-7 text-center">
          <AvatarEditor entity={user} onSave={setProfilePhoto} label="profile photo" />
          <div className="space-y-1">
            <h1 className="text-lg font-bold">{user.name}</h1>
            <p dir="ltr" className="text-sm text-muted-foreground">
              @{user.username}
            </p>
            <p dir="ltr" className="text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        <Section title="Edit name" description="The name others see in chats.">
          <EditNameForm name={user.name} />
        </Section>

        <Section title="Change password" description="The new password must be at least 8 characters.">
          <ChangePasswordForm />
        </Section>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 text-card-foreground">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

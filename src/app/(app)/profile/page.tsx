import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { EditNameForm } from "@/components/profile/edit-name-form";
import { LogoutButton } from "@/components/profile/logout-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "پروفایل | کوشولو" };

export default function ProfilePage() {
  return (
    <div className="space-y-4 px-4 py-6">
      {/* Reading the session is request-time data, so it streams in. */}
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
      <Section title="خروج" description="از حساب کاربری خود در این دستگاه خارج شوید.">
        <LogoutButton />
      </Section>
    </div>
  );
}

async function ProfileContent() {
  const user = await requireUser();

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-7 text-center">
        <Avatar className="size-20 after:hidden">
          <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
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

      <Section title="ویرایش نام" description="نامی که دیگران در گفتگوها می‌بینند.">
        <EditNameForm name={user.name} />
      </Section>

      <Section title="تغییر رمز عبور" description="رمز جدید باید حداقل ۸ کاراکتر باشد.">
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

function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-7">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

// First letter of the first two words. A zero-width non-joiner keeps Persian
// letters from joining into a single glyph.
function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("‌");
}

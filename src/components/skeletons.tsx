import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Loading states shared by page Suspense fallbacks and loading.tsx files.

function RowSkeletons({ count, avatar = "size-12" }: { count: number; avatar?: string }) {
  return (
    <div className="space-y-1 px-2 py-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-3">
          <Skeleton className={cn(avatar, "shrink-0 rounded-full")} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatListRowsSkeleton() {
  return <RowSkeletons count={7} />;
}

export function ChatListSkeleton() {
  return (
    <>
      <div className="lg:hidden">
        <PageHeader title="گفتگوها" />
        <RowSkeletons count={7} />
      </div>
      <div className="hidden h-full bg-muted/30 lg:block" />
    </>
  );
}

export function ContactsSkeleton() {
  return (
    <>
      <PageHeader title="مخاطبین" />
      <div className="px-4 pt-4">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <RowSkeletons count={6} avatar="size-11" />
    </>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-7" aria-hidden>
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function ProfilePageSkeleton() {
  return (
    <>
      <PageHeader title="پروفایل" />
      <div className="space-y-4 px-4 py-6">
        <ProfileSkeleton />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </>
  );
}

// Bubbles of varying widths on both sides.
const BUBBLES = [
  { mine: false, width: "w-40" },
  { mine: false, width: "w-56" },
  { mine: true, width: "w-48" },
  { mine: false, width: "w-32" },
  { mine: true, width: "w-60" },
  { mine: true, width: "w-36" },
  { mine: false, width: "w-52" },
  { mine: true, width: "w-44" },
];

export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        start={<BackButton />}
        title={
          <span className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <span className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </span>
          </span>
        }
      />
      <div className="chat-bg flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden px-3 pb-3" aria-hidden>
        {BUBBLES.map((bubble, index) => (
          <Skeleton
            key={index}
            className={cn("h-10 rounded-2xl", bubble.width, bubble.mine ? "self-end" : "self-start")}
          />
        ))}
      </div>
      <div className="flex h-16 shrink-0 items-center gap-2 border-t bg-background px-3 pb-[env(safe-area-inset-bottom)]">
        <Skeleton className="h-11 flex-1 rounded-3xl" />
        <Skeleton className="size-11 rounded-full" />
      </div>
    </div>
  );
}

export function InfoSkeleton() {
  return (
    <>
      <PageHeader start={<BackButton />} title="اطلاعات" />
      <div className="space-y-4 px-4 py-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="rounded-2xl border bg-card">
          <RowSkeletons count={4} avatar="size-11" />
        </div>
      </div>
    </>
  );
}

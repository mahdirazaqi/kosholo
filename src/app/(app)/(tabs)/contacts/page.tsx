import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsView } from "@/components/contacts/contacts-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/contacts";

export const metadata: Metadata = { title: "مخاطبین | کوشولو" };

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsContent />
    </Suspense>
  );
}

async function ContactsContent() {
  const user = await requireUser();
  const contacts = await getContacts(user.id);
  return <ContactsView contacts={contacts} />;
}

function ContactsSkeleton() {
  return (
    <>
      <PageHeader title="مخاطبین" />
      <div className="space-y-1 px-4 py-4">
        <Skeleton className="mb-3 h-11 w-full rounded-xl" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 py-2.5">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

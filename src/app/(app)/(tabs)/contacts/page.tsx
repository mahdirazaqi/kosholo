import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsSkeleton } from "@/components/skeletons";
import { ContactsView } from "@/components/contacts/contacts-view";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/contacts";

export const metadata: Metadata = { title: "Contacts | Kosholo" };

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

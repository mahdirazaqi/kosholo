import type { Metadata } from "next";
import { Suspense } from "react";
import { NewGroupFlow } from "@/components/groups/new-group-flow";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/contacts";

export const metadata: Metadata = { title: "New group | Kosholo" };

export default function NewGroupPage() {
  return (
    <Suspense fallback={<PageHeader start={<BackButton />} title="New group" />}>
      <NewGroup />
    </Suspense>
  );
}

async function NewGroup() {
  const user = await requireUser();
  const contacts = await getContacts(user.id);
  return <NewGroupFlow contacts={contacts} />;
}

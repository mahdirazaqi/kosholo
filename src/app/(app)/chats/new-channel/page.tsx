import type { Metadata } from "next";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { NewChannelFlow } from "@/components/channels/new-channel-flow";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { getContacts } from "@/lib/contacts";

export const metadata: Metadata = { title: "New channel | Kosholo" };

export default function NewChannelPage() {
  return (
    <Suspense fallback={<PageHeader start={<BackButton />} title="New channel" />}>
      <NewChannel />
    </Suspense>
  );
}

async function NewChannel() {
  const user = await requireUser();
  const contacts = await getContacts(user.id);
  return <NewChannelFlow contacts={contacts} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { DirectInfoView } from "@/components/groups/direct-info-view";
import { GroupInfoView } from "@/components/groups/group-info-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/chat/conversations";
import { getGroupInfo } from "@/lib/chat/groups";
import { getContacts } from "@/lib/contacts";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "اطلاعات گفتگو | کوشولو" };

export default function InfoPage({ params }: PageProps<"/chats/[conversationId]/info">) {
  return (
    <Suspense fallback={<InfoSkeleton />}>
      <Info params={params} />
    </Suspense>
  );
}

async function Info({ params }: Pick<PageProps<"/chats/[conversationId]/info">, "params">) {
  const { conversationId } = await params;
  const user = await requireUser();
  const conversation = await getConversationForMember(conversationId, user.id);
  if (!conversation) notFound();

  if (conversation.type === "GROUP") {
    const [info, contacts] = await Promise.all([getGroupInfo(conversation.id, user.id), getContacts(user.id)]);
    if (!info) notFound();
    return <GroupInfoView key={info.id} initialInfo={info} contacts={contacts} currentUserId={user.id} />;
  }

  const other = conversation.otherUser;
  if (!other) notFound();
  const isContact = (await db.contact.count({ where: { ownerId: user.id, contactId: other.id } })) > 0;
  return <DirectInfoView user={other} initialIsContact={isContact} />;
}

function InfoSkeleton() {
  return (
    <>
      <PageHeader start={<BackButton />} title="اطلاعات" />
      <div className="flex flex-col items-center gap-3 px-4 py-8">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
    </>
  );
}

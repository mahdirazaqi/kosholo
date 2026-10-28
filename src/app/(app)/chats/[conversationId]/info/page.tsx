import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InfoSkeleton } from "@/components/skeletons";
import { DirectInfoView } from "@/components/groups/direct-info-view";
import { GroupInfoView } from "@/components/groups/group-info-view";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/chat/conversations";
import { getGroupInfo } from "@/lib/chat/groups";
import { getContacts } from "@/lib/contacts";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Chat info | Kosholo" };

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
  return <DirectInfoView conversationId={conversation.id} user={other} initialIsContact={isContact} />;
}

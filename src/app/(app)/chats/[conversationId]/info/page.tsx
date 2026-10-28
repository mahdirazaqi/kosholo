import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InfoSkeleton } from "@/components/skeletons";
import { ChannelInfoView } from "@/components/channels/channel-info-view";
import { DirectInfoView } from "@/components/groups/direct-info-view";
import { GroupInfoView } from "@/components/groups/group-info-view";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/chat/conversations";
import { getChannelInfo } from "@/lib/chat/channels";
import { getGroupInfo } from "@/lib/chat/groups";
import { getContacts } from "@/lib/contacts";
import { getProfilePhotos } from "@/lib/profile-photos";
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

  if (conversation.type === "CHANNEL") {
    // Only admins get the contacts (for adding) and the admin list/invite token.
    const info = await getChannelInfo(conversation.id, user.id);
    if (!info) notFound();
    const contacts = info.myRole === "ADMIN" ? await getContacts(user.id) : [];
    return <ChannelInfoView key={info.id} initialInfo={info} contacts={contacts} />;
  }

  if (conversation.type === "GROUP") {
    const [info, contacts] = await Promise.all([getGroupInfo(conversation.id, user.id), getContacts(user.id)]);
    if (!info) notFound();
    return <GroupInfoView key={info.id} initialInfo={info} contacts={contacts} currentUserId={user.id} muted={conversation.muted} />;
  }

  const other = conversation.otherUser;
  if (!other) notFound();
  const isContact = (await db.contact.count({ where: { ownerId: user.id, contactId: other.id } })) > 0;
  const photos = (await getProfilePhotos(user.id, other.id)) ?? [];
  return <DirectInfoView conversationId={conversation.id} user={other} initialIsContact={isContact} muted={conversation.muted} initialPhotos={photos} />;
}

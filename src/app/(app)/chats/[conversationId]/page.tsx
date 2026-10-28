import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatSkeleton } from "@/components/skeletons";
import { ChatView } from "@/components/chat/chat-view";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/chat/conversations";
import { getMessages } from "@/lib/chat/messages";
import { getViewer } from "@/lib/chat/visibility";

export const metadata: Metadata = { title: "Chat | Kosholo" };

export default function ChatPage({ params }: PageProps<"/chats/[conversationId]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat params={params} />
    </Suspense>
  );
}

// Non-members (and malformed ids) get the not-found page. Under Cache
// Components the static shell has already streamed, so the HTTP status stays
// 200 with a noindex tag; no conversation data is sent either way.
async function Chat({ params }: Pick<PageProps<"/chats/[conversationId]">, "params">) {
  const { conversationId } = await params;
  const user = await requireUser();
  const conversation = await getConversationForMember(conversationId, user.id);
  const viewer = conversation && (await getViewer(conversation.id, user.id));
  if (!conversation || !viewer) notFound();

  const page = await getMessages(conversation.id, viewer);
  return (
    <ChatView
      // Remount per conversation so local message state never leaks across chats.
      key={conversation.id}
      conversation={conversation}
      currentUser={{ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl }}
      initialPage={page}
    />
  );
}

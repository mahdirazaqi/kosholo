import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { ChatView } from "@/components/chat/chat-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/chat/conversations";
import { getMessages } from "@/lib/chat/messages";

export const metadata: Metadata = { title: "گفتگو | کوشولو" };

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
  if (!conversation) notFound();

  const page = await getMessages(conversation.id);
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

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        start={<BackButton />}
        title={
          <span className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </span>
        }
      />
      <div className="chat-bg flex-1" />
      <div className="h-16 border-t bg-background" />
    </div>
  );
}

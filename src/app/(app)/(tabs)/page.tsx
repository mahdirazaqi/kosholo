import { Suspense } from "react";
import { ChatListView } from "@/components/chat/chat-list-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getConversations } from "@/lib/chat/conversations";
import { getContacts } from "@/lib/contacts";

export default function ChatsPage() {
  return (
    <Suspense fallback={<ChatListSkeleton />}>
      <ChatListContent />
    </Suspense>
  );
}

async function ChatListContent() {
  const user = await requireUser();
  const [conversations, contacts] = await Promise.all([
    getConversations(user.id),
    getContacts(user.id),
  ]);
  return <ChatListView conversations={conversations} contacts={contacts} />;
}

function ChatListSkeleton() {
  return (
    <>
      <PageHeader title="گفتگوها" />
      <div className="space-y-1 px-2 py-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-2 py-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

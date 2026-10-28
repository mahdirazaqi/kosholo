import { Suspense } from "react";
import { ChatListView, NewConversationLauncher } from "@/components/chat/chat-list-view";
import { PageHeader } from "@/components/page-header";
import { InstallBanner } from "@/components/pwa/install";
import { SelectChatPane } from "@/components/select-chat-pane";
import { ChatListRowsSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import { getConversations } from "@/lib/chat/conversations";

// Header, install banner and "New chat" are in the static shell (instant
// first paint); only the list itself streams in.
export default function ChatsPage() {
  return (
    <>
      {/* Desktop shows the list in the sidebar and an empty main pane here. */}
      <div className="contents lg:hidden">
        <PageHeader title="Chats" />
        <InstallBanner />
        <Suspense fallback={<ChatListRowsSkeleton />}>
          <ChatList />
        </Suspense>
        <NewConversationLauncher variant="fab" />
      </div>
      <SelectChatPane />
    </>
  );
}

async function ChatList() {
  const user = await requireUser();
  const conversations = await getConversations(user.id);
  return <ChatListView conversations={conversations} currentUserId={user.id} />;
}

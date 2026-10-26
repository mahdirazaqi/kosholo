import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getConversationForMember } from "@/lib/conversations";

export const metadata: Metadata = { title: "گفتگو | کوشولو" };

// Temporary placeholder; the real chat UI comes in phase 3.
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

  const other =
    conversation.type === "DIRECT"
      ? conversation.members.find((member) => member.user.id !== user.id)?.user
      : undefined;
  const title = other?.name ?? conversation.title ?? "گفتگو";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        start={<BackButton />}
        title={
          <span className="flex items-center gap-3">
            {other && <UserAvatar user={other} size="sm" />}
            <span className="truncate">{title}</span>
          </span>
        }
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
          <MessagesSquare className="size-8" strokeWidth={1.5} />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          گفتگو با {title} به‌زودی اینجا خواهد بود.
        </p>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <PageHeader
      start={<BackButton />}
      title={
        <span className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </span>
      }
    />
  );
}

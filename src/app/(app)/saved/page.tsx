import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import { getOrCreateSavedConversation } from "@/lib/chat/saved";

// Shortcut target (profile, sidebar, new-chat picker): opens my Saved Messages,
// creating it the first time.
export default function SavedPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <OpenSaved />
    </Suspense>
  );
}

async function OpenSaved(): Promise<null> {
  const user = await requireUser();
  redirect(`/chats/${await getOrCreateSavedConversation(user.id)}`);
}

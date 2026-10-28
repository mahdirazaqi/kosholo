"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { joinChannel } from "@/app/(app)/chats/channel-actions";
import { LinkifiedText } from "@/components/linkified-text";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/numbers";

// What a visitor sees before subscribing: only the public facts of the channel.
export function JoinChannelCard({
  token,
  channel,
}: {
  token: string;
  channel: { id: string; title: string; avatarUrl: string | null; description: string | null; memberCount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function join() {
    startTransition(async () => {
      const result = await joinChannel(token);
      if (result.ok) router.replace(`/chats/${result.conversationId}`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="px-4 py-8">
      <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-5 py-8 text-center">
        <UserAvatar user={{ id: channel.id, name: channel.title, avatarUrl: channel.avatarUrl }} size="2xl" />
        <h1 dir="auto" className="text-xl font-bold">{channel.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Megaphone className="size-4" />
          Channel · {formatCount(channel.memberCount, "subscriber")}
        </p>
        {channel.description && (
          <LinkifiedText text={channel.description} className="w-full text-start text-sm leading-6 whitespace-pre-wrap break-words" />
        )}
        <Button size="lg" onClick={join} disabled={pending} className="mt-2 h-12 w-full rounded-xl text-base">
          {pending && <Loader2 className="animate-spin" />}
          Join channel
        </Button>
      </section>
    </div>
  );
}

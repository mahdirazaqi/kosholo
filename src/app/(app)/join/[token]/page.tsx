import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2Off } from "lucide-react";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { JoinChannelCard } from "@/components/channels/join-channel-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getChannelPreview } from "@/lib/chat/channels";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

// Never indexed: the token is a secret.
export const metadata: Metadata = { title: "Join channel | Kosholo", robots: { index: false, follow: false } };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={<PageHeader start={<BackButton />} title="Join channel" />}>
      <Join params={params} />
    </Suspense>
  );
}

// Logged-out visitors are sent to /login?from=/join/{token} by proxy.ts and
// come back here afterwards.
async function Join({ params }: Pick<PageProps<"/join/[token]">, "params">) {
  const { token } = await params;
  const user = await requireUser();

  // Unknown tokens count against the user and the IP, so links can't be guessed.
  const keys = [`bad-invite:${user.id}`, `bad-invite-ip:${await getClientIp()}`];
  if (keys.some((key) => isRateLimited(key, LIMITS.badInviteLinks))) {
    return <Problem title={RATE_LIMIT_ERROR} />;
  }
  const preview = await getChannelPreview(token, user.id);
  if (!preview) {
    for (const key of keys) recordHit(key, LIMITS.badInviteLinks);
    return <Problem title="This invite link isn't valid" description="It may have been reset by the channel's admins." />;
  }
  if (preview.isMember) redirect(`/chats/${preview.id}`);

  return (
    <>
      <PageHeader start={<BackButton />} title="Join channel" />
      <JoinChannelCard token={token} channel={preview} />
    </>
  );
}

function Problem({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <PageHeader start={<BackButton />} title="Join channel" />
      <EmptyState
        icon={<Link2Off />}
        title={title}
        description={description}
        action={
          <Button asChild size="lg" className="h-11 rounded-xl px-5 text-base">
            <Link href="/">Back to chats</Link>
          </Button>
        }
      />
    </>
  );
}

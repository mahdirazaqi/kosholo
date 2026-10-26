"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarTint } from "@/lib/colors";
import { avatarThumbUrl } from "@/lib/media/serialize";
import { useRealtimeStore } from "@/lib/realtime/client/store";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "size-7 text-xs",
  sm: "size-9 text-sm",
  md: "size-11 text-base",
  lg: "size-16 text-xl",
  xl: "size-20 text-2xl",
  "2xl": "size-24 text-3xl",
} as const;

export function UserAvatar({
  user,
  size = "md",
  className,
}: {
  user: { id: string; name: string; avatarUrl: string | null };
  size?: keyof typeof sizes;
  className?: string;
}) {
  // A photo changed live (user:updated / conversation:updated) wins over props.
  const override = useRealtimeStore((state) => state.avatars[user.id]);
  const avatarUrl = override !== undefined ? override : user.avatarUrl;
  // 128px thumb for list/bubble sizes; the 512px original for big ones.
  const src = size === "xl" || size === "2xl" ? avatarUrl : avatarThumbUrl(avatarUrl);

  return (
    <Avatar className={cn(sizes[size], "after:hidden", className)}>
      {/* Initials show while loading and if the image fails. */}
      {src && <AvatarImage key={src} src={src} alt={user.name} className="object-cover" />}
      <AvatarFallback className={cn("text-[length:inherit] font-bold", avatarTint(user.id))}>
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

// First letter of the first two words. A zero-width non-joiner keeps Persian
// letters from joining into a single glyph.
function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("‌");
}

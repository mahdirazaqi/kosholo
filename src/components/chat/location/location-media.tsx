"use client";

import { MapPin } from "lucide-react";
import { Attribution, Pin, StaticTiles } from "@/components/chat/location/map-shared";
import { PREVIEW_ZOOM } from "@/lib/map/config";
import { formatCoordinates } from "@/lib/map/tiles";
import type { ChatLocation, ChatMessage } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

// LOCATION bubble: a static map preview (tiles laid out with CSS, no Leaflet
// instance per bubble) with a fixed aspect ratio, then the label and
// coordinates. Tapping opens the full-screen map (MediaViewer).
export function LocationMedia({
  message,
  isMine,
  onOpen,
}: {
  message: ChatMessage;
  isMine: boolean;
  onOpen: () => void;
}) {
  const location = message.location;
  if (!location) return null;
  const coordinates = formatCoordinates(location.latitude, location.longitude);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open location${location.label ? `: ${location.label}` : ""} on the map`}
      className="block w-[min(16rem,65vw)] text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-xl"
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl">
        <StaticTiles location={location} zoom={PREVIEW_ZOOM} />
        <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
          <Pin className="drop-shadow" />
        </span>
        <Attribution />
      </span>
      <span className="block px-2 pt-1.5">
        {location.label && (
          <span dir="auto" className="block truncate text-[15px] leading-6 font-medium">
            {location.label}
          </span>
        )}
        <span
          dir="ltr"
          className={cn(
            "flex items-center gap-1 text-xs tabular-nums",
            isMine ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          <MapPin className="size-3.5 shrink-0" />
          {coordinates}
        </span>
      </span>
    </button>
  );
}

// Tiny map for reply quotes and the reply bar (a scaled-down tile block).
export function LocationThumb({ location, className }: { location: ChatLocation; className?: string }) {
  return (
    <span className={cn("relative block overflow-hidden", className)} aria-hidden>
      <StaticTiles location={location} zoom={Math.max(1, PREVIEW_ZOOM - 1)} scale={0.25} />
      <span className="absolute start-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white rtl:translate-x-1/2" />
    </span>
  );
}

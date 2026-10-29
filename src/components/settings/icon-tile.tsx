import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The fixed tile colours (tokens, tuned for every theme and both modes). Full
// class names so Tailwind can see them.
export const TILE_COLORS = {
  blue: "bg-tile-blue",
  sky: "bg-tile-sky",
  green: "bg-tile-green",
  orange: "bg-tile-orange",
  red: "bg-tile-red",
  purple: "bg-tile-purple",
  gray: "bg-tile-gray",
  teal: "bg-tile-teal",
  pink: "bg-tile-pink",
  yellow: "bg-tile-yellow",
} as const;
export type TileColor = keyof typeof TILE_COLORS;

// 30×30 rounded square with a solid colour and a white icon.
export function IconTile({ icon: Icon, color, className }: { icon: LucideIcon; color: TileColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-[7px] text-tile-foreground",
        TILE_COLORS[color],
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  );
}

// "Open in…" links for a point, in one place.
//
// Google Maps and geo: follow documented formats (Maps URLs API; RFC 5870).
// Neshan and Balad don't publish a URL spec, and their formats couldn't be
// verified from public documentation when this was written (2026-10): these
// are the formats their web apps are known to use. Re-check them on a phone
// if either changes.
import type { ChatLocation } from "@/lib/types/chat";

export type MapLink = { id: "google" | "neshan" | "balad" | "geo"; label: string; href: string };

export function mapLinks({ latitude, longitude, label }: ChatLocation): MapLink[] {
  const point = `${latitude},${longitude}`;
  const query = label ? `(${encodeURIComponent(label)})` : "";
  return [
    {
      id: "google",
      label: "Google Maps",
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`,
    },
    { id: "neshan", label: "Neshan", href: `https://neshan.org/maps/@${point},16z,0p` },
    {
      id: "balad",
      label: "Balad",
      href: `https://balad.ir/location?latitude=${latitude}&longitude=${longitude}&zoom=16`,
    },
    // Opens the device's default maps app (Android; ignored on desktop).
    { id: "geo", label: "Other map app", href: `geo:${point}?q=${point}${query}` },
  ];
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_ATTRIBUTION, PREVIEW_ZOOM } from "@/lib/map/config";
import { TILE_SIZE, tileBlock } from "@/lib/map/tiles";
import type { ChatLocation } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

// Pieces shared by the bubble, the picker and the viewer. Nothing here imports
// Leaflet, so the bubble stays light.

export const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 39 16 39s15-12 15-23.2C31 7.6 24.3 1 16 1z" fill="#ef4444" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>`;

// Red map pin whose tip is at the bottom center of the box.
export function Pin({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-10 w-8", className)} dangerouslySetInnerHTML={{ __html: PIN_SVG }} />;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Static map: a 2×2 block of tiles positioned so the point is in the middle of
// the box (no Leaflet). `scale` shrinks it for thumbnails. Tiles are plain
// <img>s (no crossOrigin, so providers without CORS still work).
export function StaticTiles({
  location,
  zoom = PREVIEW_ZOOM,
  scale = 1,
}: {
  location: ChatLocation;
  zoom?: number;
  scale?: number;
}) {
  const { tiles, px, py } = tileBlock(location.latitude, location.longitude, zoom);
  const size = TILE_SIZE * scale;
  return (
    // Positions are physical pixel offsets inside the map: always LTR.
    <div dir="ltr" aria-hidden className="absolute inset-0 overflow-hidden bg-muted">
      <div
        className="absolute"
        style={{ left: `calc(50% - ${px * scale}px)`, top: `calc(50% - ${py * scale}px)`, width: size * 2, height: size * 2 }}
      >
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="strict-origin-when-cross-origin"
            onError={(event) => (event.currentTarget.style.visibility = "hidden")}
            className="absolute max-w-none select-none"
            style={{ left: tile.dx * size, top: tile.dy * size, width: size, height: size }}
          />
        ))}
      </div>
    </div>
  );
}

export function Attribution({ className }: { className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn(
        "pointer-events-none absolute end-0 bottom-0 max-w-full truncate rounded-ss-md bg-background/75 px-1 text-[9px] leading-3.5 text-foreground/70",
        className,
      )}
    >
      {MAP_ATTRIBUTION}
    </span>
  );
}

export type GeoState =
  | { status: "locating" }
  | { status: "ok"; latitude: number; longitude: number; accuracy: number }
  | { status: "denied" | "unavailable" };

// The device position while `active`: watchPosition (high accuracy, 10s
// timeout). Reports "unavailable" without a secure context or Geolocation API.
// `retry()` asks again (e.g. "My location" after a timeout).
export function useGeolocation(active: boolean) {
  const [state, setState] = useState<GeoState>({ status: "locating" });
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reporting an environment fact once
      setState({ status: "unavailable" });
      return;
    }
    setState((current) => (current.status === "ok" ? current : { status: "locating" }));
    watchId.current = navigator.geolocation.watchPosition(
      (position) =>
        setState({
          status: "ok",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) =>
        setState((current) =>
          current.status === "ok" ? current : { status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" },
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [active, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { geo: state, retry };
}

export const GEO_MESSAGES = {
  denied: "Location access is blocked. You can allow it in your browser settings, or drag the map to choose a point.",
  unavailable:
    "Your location isn't available here (it needs a secure connection and location services). Drag the map to choose a point.",
} as const;

// Leaflet renders attribution as HTML; ours is configured as plain text.
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

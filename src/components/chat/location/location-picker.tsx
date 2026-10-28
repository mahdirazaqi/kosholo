"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { Crosshair, Info, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { escapeHtml, GEO_MESSAGES, Pin, prefersReducedMotion, useGeolocation } from "@/components/chat/location/map-shared";
import { MAX_LOCATION_LABEL } from "@/lib/chat/limits";
import { FALLBACK_CENTER, FALLBACK_ZOOM, MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_SUBDOMAINS, MAP_TILE_URL, PICK_ZOOM } from "@/lib/map/config";
import { formatCoordinates, round6 } from "@/lib/map/tiles";
import { formatNumber } from "@/lib/numbers";
import type { ChatLocation } from "@/lib/types/chat";

type Point = { latitude: number; longitude: number };

// Full-screen location picker. The map starts on the device position (blue
// dot + accuracy circle); a pin fixed at the center marks the chosen point,
// so dragging the map chooses it. Without location access (denied, no GPS,
// not HTTPS) it starts on FALLBACK_CENTER and the user picks manually.
// Loaded with next/dynamic (no SSR), so Leaflet only downloads when opened.
export default function LocationPicker({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (location: ChatLocation) => void;
}) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [center, setCenter] = useState<Point>(FALLBACK_CENTER);
  const [label, setLabel] = useState("");
  const { geo, retry } = useGeolocation(open);
  // Follow the first fix, but never move the map once the user has dragged it.
  const moved = useRef(false);
  const centeredOnFix = useRef(false);

  useEffect(() => {
    if (!map || geo.status !== "ok" || centeredOnFix.current || moved.current) return;
    centeredOnFix.current = true;
    map.setView([geo.latitude, geo.longitude], PICK_ZOOM, { animate: false });
  }, [map, geo]);

  // The dialog animates in; Leaflet must measure the final size.
  useEffect(() => {
    if (!map) return;
    const id = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(id);
  }, [map]);

  function recenter() {
    if (geo.status !== "ok") return retry();
    map?.flyTo([geo.latitude, geo.longitude], Math.max(map.getZoom(), PICK_ZOOM), {
      animate: !prefersReducedMotion(),
    });
  }

  function send(point: Point) {
    onSend({ latitude: round6(point.latitude), longitude: round6(point.longitude), label: label.trim() || null });
  }

  const reduced = prefersReducedMotion();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="size-11 rounded-full"
          >
            <X className="size-6" />
          </Button>
          <DialogTitle className="text-base font-semibold">Send location</DialogTitle>
          <DialogDescription className="sr-only">Drag the map to place the pin, then send the point or your current location.</DialogDescription>
        </div>

        <div dir="ltr" data-allow-zoom className="relative min-h-0 flex-1 touch-none">
          <MapContainer
            ref={setMap}
            center={[FALLBACK_CENTER.latitude, FALLBACK_CENTER.longitude]}
            zoom={FALLBACK_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
            zoomAnimation={!reduced}
            fadeAnimation={!reduced}
            className="size-full"
          >
            <TileLayer url={MAP_TILE_URL} subdomains={MAP_SUBDOMAINS} maxZoom={MAP_MAX_ZOOM} attribution={escapeHtml(MAP_ATTRIBUTION)} />
            <CenterTracker
              onMove={setCenter}
              onDrag={() => {
                moved.current = true;
              }}
            />
            {geo.status === "ok" && (
              <>
                <Circle
                  center={[geo.latitude, geo.longitude]}
                  radius={geo.accuracy}
                  pathOptions={{ color: "#3b82f6", weight: 1, fillOpacity: 0.12 }}
                  interactive={false}
                />
                <CircleMarker
                  center={[geo.latitude, geo.longitude]}
                  radius={7}
                  pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }}
                  interactive={false}
                />
              </>
            )}
          </MapContainer>

          {/* The chosen point: a pin fixed at the center, tip on the center. */}
          <div className="pointer-events-none absolute start-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <Pin className="drop-shadow-md" />
          </div>

          <Button
            variant="outline"
            size="icon-lg"
            aria-label="My location"
            onClick={recenter}
            className="absolute end-3 bottom-3 z-[500] size-11 rounded-full bg-background shadow-md"
          >
            {geo.status === "locating" ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
          </Button>
        </div>

        <div className="grid shrink-0 gap-2 border-t px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {(geo.status === "denied" || geo.status === "unavailable") && (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              {GEO_MESSAGES[geo.status]}
            </p>
          )}

          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={MAX_LOCATION_LABEL}
            dir="auto"
            placeholder="Place name (optional)"
            aria-label="Place name (optional)"
            className="h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />

          {geo.status === "ok" && (
            <Option
              icon={<Crosshair />}
              title="Send my current location"
              detail={`Accuracy about ${formatNumber(Math.max(1, Math.round(geo.accuracy)))} m`}
              onClick={() => send(geo)}
            />
          )}
          <Option
            icon={<MapPin />}
            title="Send this point"
            detail={<span dir="ltr" className="tabular-nums">{formatCoordinates(center.latitude, center.longitude)}</span>}
            onClick={() => send(center)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Reports the map center on every move, and when the user drags.
function CenterTracker({ onMove, onDrag }: { onMove: (point: Point) => void; onDrag: () => void }) {
  const map = useMapEvents({
    move: () => {
      const c = map.getCenter();
      onMove({ latitude: c.lat, longitude: c.lng });
    },
    dragstart: onDrag,
  });
  return null;
}

function Option({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-2xl px-2 text-start transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer } from "react-leaflet";
import L, { type Map as LeafletMap } from "leaflet";
import { Copy, ExternalLink, Loader2, LocateFixed, Navigation, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { escapeHtml, PIN_SVG, prefersReducedMotion, useGeolocation } from "@/components/chat/location/map-shared";
import { copyText } from "@/lib/client-utils";
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_SUBDOMAINS, MAP_TILE_URL, PICK_ZOOM } from "@/lib/map/config";
import { mapLinks } from "@/lib/map-links";
import { distanceMeters, formatCoordinates, formatDistance } from "@/lib/map/tiles";
import type { ChatLocation } from "@/lib/types/chat";

// Inline SVG pin (Leaflet's default marker images break with bundlers).
const pinIcon = L.divIcon({ html: PIN_SVG, className: "", iconSize: [32, 40], iconAnchor: [16, 40] });

// Full-screen interactive map for a LOCATION message: the marker, "My
// location" (my position + distance to the point), "Open in…" other map apps,
// and "Copy coordinates". Loaded with next/dynamic (no SSR) from MediaViewer.
export default function LocationViewer({ location, onClose }: { location: ChatLocation; onClose: () => void }) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  // Location is only requested after "My location" (no prompt on open).
  const [wantsMe, setWantsMe] = useState(false);
  const { geo, retry } = useGeolocation(wantsMe);
  const fitted = useRef(false);
  const coordinates = formatCoordinates(location.latitude, location.longitude);
  const links = useMemo(() => mapLinks(location), [location]);
  const reduced = prefersReducedMotion();
  const distance =
    geo.status === "ok" ? formatDistance(distanceMeters(geo, location)) : null;

  useEffect(() => {
    if (!map) return;
    const id = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(id);
  }, [map]);

  // First fix after "My location": show both points.
  useEffect(() => {
    if (!map || !wantsMe || geo.status !== "ok" || fitted.current) return;
    fitted.current = true;
    map.fitBounds(
      L.latLngBounds([geo.latitude, geo.longitude], [location.latitude, location.longitude]).pad(0.3),
      { maxZoom: PICK_ZOOM, animate: !reduced },
    );
  }, [map, wantsMe, geo, location, reduced]);

  function showMe() {
    if (!wantsMe) return setWantsMe(true);
    if (geo.status === "ok") {
      map?.flyTo([geo.latitude, geo.longitude], Math.max(map.getZoom(), PICK_ZOOM), { animate: !reduced });
    } else retry();
  }

  async function copy() {
    try {
      await copyText(coordinates);
      toast.success("Coordinates copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
          <Button variant="ghost" size="icon-lg" aria-label="Close" onClick={onClose} className="size-11 rounded-full">
            <X className="size-6" />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle dir="auto" className="truncate text-base font-semibold">
              {location.label || "Location"}
            </DialogTitle>
            <DialogDescription dir="ltr" className="truncate text-start text-xs tabular-nums">
              {coordinates}
            </DialogDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 gap-1.5 rounded-full px-3 text-sm">
                <ExternalLink className="size-4.5" />
                Open in…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {links.map((link) => (
                <DropdownMenuItem key={link.id} asChild className="min-h-11">
                  <a
                    href={link.href}
                    {...(link.id === "geo" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                  >
                    <Navigation />
                    {link.label}
                  </a>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" onSelect={() => void copy()}>
                <Copy />
                Copy coordinates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div dir="ltr" className="relative min-h-0 flex-1">
          <MapContainer
            ref={setMap}
            center={[location.latitude, location.longitude]}
            zoom={PICK_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
            zoomAnimation={!reduced}
            fadeAnimation={!reduced}
            className="size-full"
          >
            <TileLayer url={MAP_TILE_URL} subdomains={MAP_SUBDOMAINS} maxZoom={MAP_MAX_ZOOM} attribution={escapeHtml(MAP_ATTRIBUTION)} />
            <Marker position={[location.latitude, location.longitude]} icon={pinIcon} keyboard={false} />
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

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex items-end justify-between gap-2">
            <div className="min-w-0">
              {wantsMe && (geo.status === "denied" || geo.status === "unavailable") && (
                <p role="status" className="max-w-sm rounded-xl bg-background/95 px-3 py-2 text-sm leading-5 shadow-md">
                  {geo.status === "denied"
                    ? "Location access is blocked in your browser settings."
                    : "Your location isn't available here."}
                </p>
              )}
              {distance && (
                <p role="status" className="w-fit rounded-full bg-background/95 px-3 py-1.5 text-sm font-medium shadow-md">
                  {distance} away
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="My location"
              onClick={showMe}
              className="pointer-events-auto size-11 shrink-0 rounded-full bg-background shadow-md"
            >
              {wantsMe && geo.status === "locating" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <LocateFixed className="size-5" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pure Web Mercator tile math (no Leaflet), for static previews in bubbles.
import { MAP_SUBDOMAINS, MAP_TILE_URL } from "@/lib/map/config";
import { formatNumber } from "@/lib/numbers";

export const TILE_SIZE = 256;

// Position of a point at `zoom`, in tile units (x, y may be fractional):
// floor() gives the tile, the fraction × 256 the pixel offset inside it.
export function project(latitude: number, longitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function tileUrl(x: number, y: number, zoom: number) {
  const count = 2 ** zoom;
  const wrappedX = ((x % count) + count) % count;
  const s = MAP_SUBDOMAINS[Math.abs(wrappedX + y) % MAP_SUBDOMAINS.length] ?? "";
  return MAP_TILE_URL.replace("{s}", s)
    .replace("{z}", String(zoom))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(y))
    .replace("{r}", "");
}

// A 2×2 block of tiles that contains the point with room around it, plus the
// point's pixel position inside the 512×512 block (to center it with CSS).
export function tileBlock(latitude: number, longitude: number, zoom: number) {
  const p = project(latitude, longitude, zoom);
  // Start on the tile left/above when the point is in the left/top half.
  const x0 = Math.floor(p.x - 0.5);
  const y0 = Math.max(0, Math.min(2 ** zoom - 2, Math.floor(p.y - 0.5)));
  const tiles = [0, 1].flatMap((dy) =>
    [0, 1].map((dx) => ({ key: `${dx}-${dy}`, dx, dy, url: tileUrl(x0 + dx, y0 + dy, zoom) })),
  );
  return { tiles, px: (p.x - x0) * TILE_SIZE, py: (p.y - y0) * TILE_SIZE };
}

// Great-circle distance in meters.
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// "120 m", "1.2 km", "35 km"
export function formatDistance(meters: number) {
  if (meters < 1000) return `${formatNumber(Math.round(meters))} m`;
  const km = meters / 1000;
  return `${formatNumber(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))} km`;
}

// "35.689200, 51.389000"
export function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

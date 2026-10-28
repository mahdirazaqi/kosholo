// Map tile provider, configurable per deployment (build-time NEXT_PUBLIC_
// variables, passed to the image build as build args). The default is
// OpenStreetMap's public tiles, which are for development only: their usage
// policy forbids heavy use, so production should use a provider with its own
// key (e.g. Neshan or Map.ir). Each env var is read as a literal so Next inlines it.

const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors";

export const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL;
export const MAP_SUBDOMAINS = (process.env.NEXT_PUBLIC_MAP_SUBDOMAINS || "abc").split("");
// Plain text (shown as text, never as HTML).
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || DEFAULT_ATTRIBUTION;
// Unset variables may arrive as "" (Docker build args), so "" means default too.
const maxZoom = Math.floor(Number(process.env.NEXT_PUBLIC_MAP_MAX_ZOOM || 19));
export const MAP_MAX_ZOOM = Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : 19;

// Zoom of the static preview in bubbles.
export const PREVIEW_ZOOM = Math.min(15, MAP_MAX_ZOOM);

// Shown when the user's position is unknown (no permission / no GPS):
// Tehran, where most users are, at city zoom.
export const FALLBACK_CENTER = { latitude: 35.6892, longitude: 51.389 };
export const FALLBACK_ZOOM = 11;
export const PICK_ZOOM = 16;

import type { MetadataRoute } from "next";
import { themeColorHex } from "@/lib/appearance/themes";

// A manifest can't follow the chosen theme: it uses the default theme's header colour.
const DEFAULT_COLOR = themeColorHex("firoozeh", "light");

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kosholo",
    short_name: "Kosholo",
    description: "A light, fast messenger",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: DEFAULT_COLOR,
    background_color: DEFAULT_COLOR,
    categories: ["social", "communication"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

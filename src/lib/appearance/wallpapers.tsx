import { cn } from "@/lib/utils";
import type { WallpaperId } from "./settings";

// Eight chat wallpapers, drawn in code (no image files). Each one is CSS only:
// a gradient made from theme tokens, plus monochrome SVG tiles used as a mask over
// a colour made from tokens, so every wallpaper follows the theme and the mode
// (and is crisp at any pixel density). The chat's wallpaper is the
// `data-wallpaper` attribute on <html> (set by the boot script and the runtime), so
// it needs no React state and never flashes. `<Wallpaper id>` renders one fixed id
// (settings thumbnails); without an id it shows the current one.

export const WALLPAPERS: readonly { id: WallpaperId; name: string }[] = [
  { id: "none", name: "Plain" },
  { id: "gradient", name: "Breeze" },
  { id: "girih", name: "Tile" },
  { id: "eslimi", name: "Arabesque" },
  { id: "doodle", name: "Chat doodles" },
  { id: "dots", name: "Dots" },
  { id: "waves", name: "Waves" },
  { id: "night", name: "Night sky" },
];

// The pattern strokes are black: only the alpha of the tile matters (it is a mask).
const STROKE = `fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"`;

const svg = (size: number | [number, number], body: string) => {
  const [w, h] = typeof size === "number" ? [size, size] : size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
};

// Minimal escaping for a data URI inside url("..."): keeps the CSS small.
const uri = (markup: string) =>
  `url("data:image/svg+xml,${markup.replace(/%/g, "%25").replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}")`;

// Persian girih: eight-point stars (two squares) on a lattice, joined by a diamond.
function star(cx: number, cy: number, r: number) {
  return `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"/><rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" transform="rotate(45 ${cx} ${cy})"/>`;
}
const GIRIH = svg(
  80,
  `<g ${STROKE} stroke-width="1.3">${[
    star(40, 40, 15),
    star(40, 40, 8),
    star(0, 0, 12),
    star(80, 0, 12),
    star(0, 80, 12),
    star(80, 80, 12),
  ].join("")}<path d="M40 0 80 40 40 80 0 40Z"/><circle cx="40" cy="0" r="3"/><circle cx="80" cy="40" r="3"/><circle cx="40" cy="80" r="3"/><circle cx="0" cy="40" r="3"/></g>`,
);

// Eslimi: two mirrored vines with curls and leaves; the ends meet at the tile edges.
const LEAF = "M0 0C-3-9 3-17 12-18 15-9 9-2 0 0Z";
const leaf = (x: number, y: number, rotate: number) => `<path transform="translate(${x} ${y}) rotate(${rotate})" d="${LEAF}"/>`;
const ESLIMI = svg(
  120,
  `<g ${STROKE} stroke-width="1.4"><path d="M0 30C20 0 40 0 60 30S100 60 120 30"/><path d="M0 90C20 120 40 120 60 90S100 60 120 90"/>${[
    leaf(30, 11, -20),
    leaf(30, 11, 160),
    leaf(90, 49, 20),
    leaf(90, 49, 200),
    leaf(30, 109, 20),
    leaf(30, 109, 200),
    leaf(90, 71, -20),
    leaf(90, 71, 160),
  ].join("")}<path d="M60 30c-2 9 6 14 11 9s-1-10-5-7"/><path d="M60 90c2-9-6-14-11-9s1 10 5 7"/><path d="M120 30c-2 9 6 14 11 9"/><path d="M0 30c-2 9 6 14 11 9"/><path d="M0 90c2-9 6-14 11-9"/><path d="M120 90c2-9 6-14 11-9"/><circle cx="60" cy="60" r="2.2"/><circle cx="0" cy="60" r="2.2"/><circle cx="120" cy="60" r="2.2"/></g>`,
);

// Doodles: small line icons scattered on a 200px tile.
const icon = (path: string, x: number, y: number, rotate: number, scale = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rotate} 12 12) scale(${scale})"><path d="${path}"/></g>`;
const BUBBLE = "M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z";
const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const STAR = "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z";
const PLANE = "M21 3 3 10.5l7 3 3 7zM21 3 10 13.5";
const NOTE = "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
const CUP = "M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v3M12 3v3";
const DOODLE = svg(
  200,
  `<g ${STROKE} stroke-width="1.5">${[
    icon(BUBBLE, 14, 12, -12),
    icon(HEART, 106, 18, 10, 0.9),
    icon(STAR, 156, 70, 14, 0.85),
    icon(PLANE, 56, 64, -8),
    icon(NOTE, 128, 116, 8, 0.9),
    icon(CUP, 12, 120, -6),
    icon(HEART, 70, 150, -14, 0.7),
    icon(STAR, 20, 176, 0, 0.6),
    icon(BUBBLE, 154, 164, 12, 0.8),
    icon(PLANE, 108, 76, 20, 0.6),
  ].join("")}</g><g fill="#000"><circle cx="92" cy="110" r="1.6"/><circle cx="188" cy="30" r="1.6"/><circle cx="44" cy="102" r="1.4"/><circle cx="190" cy="132" r="1.4"/><circle cx="96" cy="188" r="1.6"/></g>`,
);

const DOTS = svg(18, `<circle cx="9" cy="9" r="1" fill="#000"/>`);

// Three stacked wave fills of different opacity (the mask's alpha), repeating horizontally.
const WAVES = svg(
  [480, 140],
  `<path d="M0 70C60 40 120 40 240 70S420 100 480 70V140H0Z" fill="#000" fill-opacity=".35"/><path d="M0 95C80 70 160 70 240 95S400 120 480 95V140H0Z" fill="#000" fill-opacity=".55"/><path d="M0 120C60 104 120 104 240 120S420 136 480 120V140H0Z" fill="#000" fill-opacity=".85"/>`,
);

const STARS = svg(
  240,
  `<g fill="#000"><circle cx="20" cy="30" r="1.4"/><circle cx="64" cy="96" r="1"/><circle cx="110" cy="22" r="1.6"/><circle cx="150" cy="70" r="1"/><circle cx="206" cy="40" r="1.3"/><circle cx="30" cy="150" r="1.2"/><circle cx="96" cy="186" r="1.5"/><circle cx="140" cy="140" r="1"/><circle cx="190" cy="176" r="1.3"/><circle cx="224" cy="110" r="1"/><circle cx="170" cy="14" r="1"/><circle cx="54" cy="214" r="1"/><circle cx="214" cy="226" r="1.4"/></g><g fill="#000"><path d="M84 54l1.6 4.2 4.2 1.6-4.2 1.6L84 65.6l-1.6-4.2-4.2-1.6 4.2-1.6z"/><path d="M180 112l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z"/></g>`,
);
const MOON = svg(64, `<path d="M42 8A26 26 0 1 0 56 44 21 21 0 0 1 42 8Z" fill="#000"/>`);

type Layer = { mask: string; size: string; position?: string; repeat?: string; color: string };

// Every selector a wallpaper is reachable by: its own id, or "current" via <html>.
function selectors(id: WallpaperId, pseudo = "", dark = false) {
  const wp = dark ? ".dark " : "";
  return [
    `${wp}.wallpaper[data-wp="${id}"]${pseudo}`,
    `html${dark ? ".dark" : ""}[data-wallpaper="${id}"] .wallpaper[data-wp="current"]${pseudo}`,
  ].join(",");
}

const rule = (selector: string, body: string) => `${selector}{${body}}`;

function layer(id: WallpaperId, pseudo: "::before" | "::after", l: Layer) {
  const mask = `mask-image:${l.mask};-webkit-mask-image:${l.mask};mask-size:${l.size};-webkit-mask-size:${l.size};mask-repeat:${l.repeat ?? "repeat"};-webkit-mask-repeat:${l.repeat ?? "repeat"};mask-position:${l.position ?? "0 0"};-webkit-mask-position:${l.position ?? "0 0"}`;
  return rule(selectors(id, pseudo), `display:block;background:${l.color};${mask}`);
}

// Tile sizes scale with --wp-s (1 in chats, smaller in the settings thumbnails).
const px = (w: number, h = w) => `calc(${w}px*var(--wp-s)) calc(${h}px*var(--wp-s))`;

const mix = (token: string, percent: number, into = "transparent") => `color-mix(in oklch,var(--${token}) ${percent}%,${into})`;

export function wallpapersCss() {
  const base = [
    `.wallpaper{position:absolute;inset:0;overflow:hidden;pointer-events:none;contain:strict;background:var(--chat-bg);--wp-s:1;--wp-ink:${mix("primary", 15)};--wp-star:${mix("primary", 28)}}`,
    `.dark .wallpaper{--wp-ink:${mix("primary", 24)};--wp-star:${mix("overlay-foreground", 60)}}`,
    `.wallpaper-thumb{--wp-s:.5}`,
    `.wallpaper::before,.wallpaper::after{content:"";position:absolute;inset:0;display:none}`,
  ];
  const ink = "var(--wp-ink)";
  const rules = [
    rule(
      selectors("gradient"),
      `background:linear-gradient(160deg,${mix("primary", 17, "var(--chat-bg)")},${mix("primary", 5, "var(--chat-bg)")} 55%,${mix("primary", 13, "var(--chat-bg)")})`,
    ),
    rule(selectors("girih"), `background:linear-gradient(165deg,${mix("primary", 8, "var(--chat-bg)")},var(--chat-bg) 65%)`),
    layer("girih", "::before", { mask: uri(GIRIH), size: px(80), position: "center top", color: ink }),
    rule(selectors("eslimi"), `background:linear-gradient(200deg,${mix("primary", 7, "var(--chat-bg)")},var(--chat-bg) 70%)`),
    layer("eslimi", "::before", { mask: uri(ESLIMI), size: px(120), position: "center top", color: ink }),
    layer("doodle", "::before", { mask: uri(DOODLE), size: px(200), position: "center top", color: ink }),
    layer("dots", "::before", { mask: uri(DOTS), size: px(18), color: ink }),
    rule(selectors("dots", "::after"), `display:block;background:radial-gradient(ellipse at 50% 38%,transparent 30%,var(--chat-bg) 100%)`),
    rule(selectors("waves"), `background:linear-gradient(to bottom,var(--chat-bg),${mix("primary", 6, "var(--chat-bg)")})`),
    layer("waves", "::before", {
      mask: uri(WAVES),
      size: px(480, 140),
      position: "0 100%",
      repeat: "repeat-x",
      color: `linear-gradient(to top,${mix("primary", 26)},${mix("primary", 6)})`,
    }),
    layer("waves", "::after", {
      mask: uri(WAVES),
      size: px(720, 190),
      position: "calc(180px*var(--wp-s)) 100%",
      repeat: "repeat-x",
      color: `linear-gradient(to top,${mix("primary", 14)},transparent)`,
    }),
    rule(
      selectors("night"),
      `background:linear-gradient(to bottom,${mix("primary", 20, "var(--background)")},${mix("accent", 70, "var(--background)")} 85%)`,
    ),
    rule(
      selectors("night", "", true),
      `background:linear-gradient(to bottom,${mix("primary", 24, "var(--viewer)")},${mix("primary", 7, "var(--chat-bg)")})`,
    ),
    layer("night", "::before", { mask: uri(STARS), size: px(240), position: "center top", color: "var(--wp-star)" }),
    rule(
      selectors("night", "::after"),
      `display:block;inset:auto;top:7%;inset-inline-end:11%;width:calc(56px*var(--wp-s));height:calc(56px*var(--wp-s));mask-image:${uri(MOON)};-webkit-mask-image:${uri(MOON)};mask-size:contain;-webkit-mask-size:contain;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat`,
    ),
  ];
  // In light mode the moon is a faint primary crescent over the dawn.
  const lightMoon = rule(
    [`.wallpaper[data-wp="night"]::after`, `html[data-wallpaper="night"] .wallpaper[data-wp="current"]::after`].join(","),
    `background:${mix("primary", 30)}`,
  );
  const darkMoon = rule(
    [`.dark .wallpaper[data-wp="night"]::after`, `html.dark[data-wallpaper="night"] .wallpaper[data-wp="current"]::after`].join(","),
    `background:${mix("overlay-foreground", 78)}`,
  );
  return [...base, ...rules, lightMoon, darkMoon].join("\n");
}

// A fixed wallpaper (`id`, e.g. a settings thumbnail) or the chat's current one.
// A decorative layer behind the content: it does not scroll with the messages.
export function Wallpaper({ id, className }: { id?: WallpaperId; className?: string }) {
  return <div aria-hidden data-wp={id ?? "current"} className={cn("wallpaper", className)} />;
}

import { type Oklch, oklchCss, toHex } from "./color";
import type { ThemeId } from "./settings";

// Six colour themes, each with a light and a dark variant, all derived from a few
// numbers per theme (OKLCH). `themesCss()` turns them into CSS variables that the
// root layout injects in <head>; components only ever use the tokens
// (bg-primary, bg-bubble-out, text-link, ...). Run `npm run check:contrast` after
// touching anything here: it fails below WCAG AA.

export type Mode = "light" | "dark";

export const TOKEN_NAMES = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "success", "border", "input", "ring",
  "header-bg", "chat-bg",
  "bubble-out", "bubble-out-foreground", "bubble-out-meta", "bubble-in", "bubble-in-foreground", "bubble-in-meta",
  "link", "unread-badge", "unread-badge-foreground", "unread-badge-muted", "unread-badge-muted-foreground",
  "service-pill", "service-pill-foreground",
  "sender-1", "sender-2", "sender-3", "sender-4", "sender-5", "sender-6", "sender-7", "sender-8",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Palette = Record<TokenName, Oklch>;

type ModeSpec = {
  // The primary colour (buttons, badges, own-bubble tint) as lightness/chroma.
  primary: readonly [l: number, c: number];
  // Text on the primary: white-ish or dark (saffron is too bright for white).
  onPrimary: "light" | "dark";
  // Chroma multiplier for the tinted neutrals (yellow looks muddy when strong).
  neutral?: number;
};

type ThemeSpec = {
  id: ThemeId;
  name: string;
  description: string;
  hue: number;
  light: ModeSpec;
  dark: ModeSpec;
};

export const THEMES: readonly ThemeSpec[] = [
  { id: "firoozeh", name: "Turquoise", description: "Fresh and calm", hue: 190, light: { primary: [0.53, 0.1], onPrimary: "light" }, dark: { primary: [0.76, 0.11], onPrimary: "dark" } },
  { id: "lajvard", name: "Lapis", description: "Classic and trustworthy", hue: 263, light: { primary: [0.5, 0.19], onPrimary: "light" }, dark: { primary: [0.72, 0.13], onPrimary: "dark" } },
  { id: "anar", name: "Pomegranate", description: "Warm and bold", hue: 14, light: { primary: [0.54, 0.205], onPrimary: "light" }, dark: { primary: [0.74, 0.13], onPrimary: "dark" } },
  { id: "zafaran", name: "Saffron", description: "Sunny and warm", hue: 72, light: { primary: [0.74, 0.165], onPrimary: "dark", neutral: 0.8 }, dark: { primary: [0.8, 0.15], onPrimary: "dark", neutral: 0.7 } },
  { id: "peste", name: "Pistachio", description: "Natural and soft", hue: 138, light: { primary: [0.52, 0.13], onPrimary: "light" }, dark: { primary: [0.78, 0.14], onPrimary: "dark" } },
  { id: "yas", name: "Jasmine", description: "Elegant lavender", hue: 293, light: { primary: [0.54, 0.21], onPrimary: "light" }, dark: { primary: [0.76, 0.13], onPrimary: "dark" } },
] as const;

export const DEFAULT_THEME: ThemeId = "firoozeh";

// Eight group sender-name hues, readable on the incoming bubble in every theme.
const SENDER_HUES = [
  [22, 0.19], [62, 0.13], [150, 0.14], [200, 0.12], [260, 0.19], [300, 0.2], [340, 0.19], [105, 0.12],
] as const;

function palette(spec: ThemeSpec, mode: Mode): Palette {
  const { hue: h } = spec;
  const m = spec[mode];
  const [pl, pc] = m.primary;
  const n = m.neutral ?? 1;
  const dark = mode === "dark";
  const light = (l: number, c: number): Oklch => [l, c * n, h];
  const primary: Oklch = [pl, pc, h];
  const onPrimary: Oklch = m.onPrimary === "light" ? [0.99, 0.01, h] : [0.2, 0.04, h];
  const senders = Object.fromEntries(
    SENDER_HUES.map(([sh, sc], i) => [`sender-${i + 1}`, [dark ? 0.78 : 0.5, dark ? sc * 0.75 : sc, sh] as Oklch]),
  ) as Pick<Palette, `sender-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`>;

  if (!dark) {
    return {
      background: light(0.985, 0.01),
      foreground: light(0.215, 0.03),
      card: light(0.998, 0.004),
      "card-foreground": light(0.215, 0.03),
      popover: light(0.998, 0.004),
      "popover-foreground": light(0.215, 0.03),
      primary,
      "primary-foreground": onPrimary,
      secondary: light(0.955, 0.016),
      "secondary-foreground": light(0.28, 0.035),
      muted: light(0.955, 0.016),
      "muted-foreground": light(0.46, 0.035),
      accent: light(0.93, 0.035),
      "accent-foreground": light(0.25, 0.045),
      destructive: [0.55, 0.21, 27],
      "destructive-foreground": [0.99, 0.01, 27],
      success: [0.5, 0.13, 150],
      border: light(0.9, 0.016),
      input: light(0.9, 0.016),
      ring: [Math.min(pl, 0.55), pc, h],
      "header-bg": light(0.965, 0.03),
      "chat-bg": light(0.95, 0.03),
      "bubble-out": [0.915, Math.min(pc * 0.5, 0.085), h],
      "bubble-out-foreground": [0.2, 0.03, h],
      "bubble-out-meta": [0.44, 0.06, h],
      "bubble-in": light(0.998, 0.004),
      "bubble-in-foreground": light(0.215, 0.03),
      "bubble-in-meta": light(0.5, 0.035),
      link: [0.46, Math.min(pc, 0.17), h],
      "unread-badge": primary,
      "unread-badge-foreground": onPrimary,
      "unread-badge-muted": light(0.52, 0.015),
      "unread-badge-muted-foreground": [0.99, 0.005, h],
      "service-pill": [0.99, 0.006 * n, h, 0.92],
      "service-pill-foreground": light(0.4, 0.035),
      ...senders,
    };
  }
  return {
    background: light(0.17, 0.022),
    foreground: light(0.96, 0.012),
    card: light(0.215, 0.026),
    "card-foreground": light(0.96, 0.012),
    popover: light(0.24, 0.03),
    "popover-foreground": light(0.96, 0.012),
    primary,
    "primary-foreground": onPrimary,
    secondary: light(0.265, 0.03),
    "secondary-foreground": light(0.94, 0.015),
    muted: light(0.265, 0.03),
    "muted-foreground": light(0.74, 0.035),
    accent: light(0.3, 0.05),
    "accent-foreground": light(0.96, 0.02),
    destructive: [0.7, 0.19, 22],
    "destructive-foreground": [0.2, 0.04, 22],
    success: [0.78, 0.15, 150],
    border: light(0.32, 0.03),
    input: light(0.35, 0.03),
    ring: primary,
    "header-bg": light(0.235, 0.036),
    "chat-bg": light(0.185, 0.03),
    "bubble-out": [0.4, Math.min(pc * 0.55, 0.1), h],
    "bubble-out-foreground": [0.98, 0.01, h],
    "bubble-out-meta": [0.86, 0.04, h],
    "bubble-in": light(0.285, 0.026),
    "bubble-in-foreground": light(0.96, 0.012),
    "bubble-in-meta": light(0.76, 0.025),
    link: [0.82, Math.min(pc, 0.12), h],
    "unread-badge": primary,
    "unread-badge-foreground": onPrimary,
    "unread-badge-muted": light(0.45, 0.02),
    "unread-badge-muted-foreground": [0.97, 0.01, h],
    "service-pill": [0.24, 0.03 * n, h, 0.9],
    "service-pill-foreground": light(0.88, 0.025),
    ...senders,
  };
}

export const getPalette = (id: ThemeId, mode: Mode) => palette(THEMES.find((t) => t.id === id)!, mode);

// The status-bar / address-bar colour: the header over the page.
export const themeColorHex = (id: ThemeId, mode: Mode) => toHex(getPalette(id, mode)["header-bg"]);

function declarations(id: ThemeId, mode: Mode) {
  const p = getPalette(id, mode);
  return TOKEN_NAMES.map((name) => `--${name}:${oklchCss(p[name])}`).join(";");
}

// The default theme sits on :root / :root.dark, the others on html[data-theme].
// The selectors are ordered by specificity, so the stylesheet order doesn't matter.
export function themesCss() {
  const rules: string[] = [];
  for (const { id } of THEMES) {
    const base = id === DEFAULT_THEME ? ":root" : `html[data-theme="${id}"]`;
    const darkBase = id === DEFAULT_THEME ? ":root.dark" : `html.dark[data-theme="${id}"]`;
    rules.push(`${base}{${declarations(id, "light")}}`, `${darkBase}{${declarations(id, "dark")}}`);
  }
  // Settings swatches show each theme regardless of the active one: primary and
  // outgoing bubble, light and dark.
  for (const { id } of THEMES) {
    const l = getPalette(id, "light");
    const d = getPalette(id, "dark");
    rules.push(
      `.swatch[data-swatch="${id}"]{--sw-pl:${oklchCss(l.primary)};--sw-bl:${oklchCss(l["bubble-out"])};--sw-pd:${oklchCss(d.primary)};--sw-bd:${oklchCss(d["bubble-out"])}}`,
    );
  }
  return rules.join("\n");
}

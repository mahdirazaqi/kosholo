// Prints the WCAG contrast of every text/background pair of every theme × mode and
// exits 1 if any is below AA (4.5:1 for text, 3:1 for non-text UI).
// Run after touching src/lib/appearance/themes.ts: npm run check:contrast
import { composite, contrast, toRgb } from "../src/lib/appearance/color";
import { getPalette, type Mode, THEMES, type TokenName } from "../src/lib/appearance/themes";

type Pair = [fg: TokenName, bg: TokenName, min: number, note?: string];

const TEXT = 4.5;
const UI = 3;
const senders = Array.from({ length: 8 }, (_, i) => `sender-${i + 1}` as TokenName);

const PAIRS: Pair[] = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["foreground", "header-bg", TEXT],
  ["muted-foreground", "header-bg", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["foreground", "grouped-cell", TEXT],
  ["muted-foreground", "grouped-cell", TEXT, "row value"],
  ["muted-foreground", "grouped-bg", TEXT, "section header / footer"],
  ["muted-foreground", "grouped-cell-pressed", TEXT, "pressed row"],
  ["link", "grouped-cell", TEXT, "button row"],
  ["destructive", "grouped-cell", TEXT, "destructive row"],
  ["foreground", "grouped-cell-pressed", TEXT],
  ...(["blue", "sky", "green", "orange", "red", "purple", "gray", "teal", "pink", "yellow"] as const).map(
    (c): Pair => ["tile-foreground", `tile-${c}`, UI, "icon tile"],
  ),
  ["link", "background", TEXT, "text-link"],
  ["link", "card", TEXT, "text-link"],
  ["link", "chat-bg", TEXT, "text-link"],
  ["destructive-foreground", "destructive", TEXT],
  ["destructive", "background", TEXT, "text-destructive"],
  ["success", "background", TEXT, "online"],
  ["bubble-out-foreground", "bubble-out", TEXT],
  ["bubble-out-meta", "bubble-out", TEXT],
  ["bubble-in-foreground", "bubble-in", TEXT],
  ["bubble-in-meta", "bubble-in", TEXT],
  ["link", "bubble-out", TEXT],
  ["link", "bubble-in", TEXT],
  ["unread-badge-foreground", "unread-badge", TEXT],
  ["unread-badge-muted-foreground", "unread-badge-muted", TEXT],
  ["service-pill-foreground", "service-pill", TEXT, "over chat-bg"],
  ...senders.map((s): Pair => [s, "bubble-in", TEXT, "sender name"]),
  ...senders.map((s): Pair => ["card", s, UI, "file icon"]),
  ["ring", "background", UI, "UI"],
];

let failures = 0;
for (const theme of THEMES) {
  for (const mode of ["light", "dark"] as Mode[]) {
    const p = getPalette(theme.id, mode);
    const bad: string[] = [];
    let lowest = Infinity;
    for (const [fg, bg, min, note] of PAIRS) {
      // Translucent colours are composited over what they sit on.
      const resolve = (token: TokenName) =>
        p[token][3] !== undefined && p[token][3]! < 1 ? composite(p[token], p["chat-bg"]) : toRgb(p[token]);
      const bgRgb = bg === "service-pill" ? composite(p[bg], p["chat-bg"]) : resolve(bg);
      const fgRgb = p[fg][3] !== undefined && p[fg][3]! < 1 ? composite(p[fg], p[bg]) : toRgb(p[fg]);
      const ratio = contrast(fgRgb, bgRgb);
      lowest = Math.min(lowest, ratio);
      if (ratio < min) bad.push(`  ✗ ${fg} on ${bg}${note ? ` (${note})` : ""}: ${ratio.toFixed(2)} < ${min}`);
    }
    failures += bad.length;
    console.log(`${bad.length ? "FAIL" : "ok  "} ${theme.id.padEnd(9)} ${mode.padEnd(5)} lowest ${lowest.toFixed(2)}`);
    for (const line of bad) console.log(line);
  }
}
console.log(failures ? `\n${failures} pair(s) below AA` : "\nAll pairs pass WCAG AA");
process.exit(failures ? 1 : 0);

// OKLCH helpers shared by the theme generator and scripts/check-contrast.ts.
// Pure functions, no imports: safe on the client, the server and in Node scripts.

export type Oklch = readonly [l: number, c: number, h: number, a?: number];

const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function oklchCss([l, c, h, a = 1]: Oklch) {
  const base = `${round(l)} ${round(c)} ${round(h, 1)}`;
  return a < 1 ? `oklch(${base} / ${round(a, 2)})` : `oklch(${base})`;
}

// OKLCH → linear sRGB (0..1, not clamped).
function toLinear([l, c, h]: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const gamma = (value: number) => {
  const v = clamp(value);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

export function toRgb(color: Oklch): [number, number, number] {
  return toLinear(color).map((channel) => gamma(channel)) as [number, number, number];
}

export function toHex(color: Oklch) {
  return `#${toRgb(color)
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

// Alpha-composite `top` over an opaque `bottom` (in gamma-encoded sRGB, like a browser).
export function composite(top: Oklch, bottom: Oklch): [number, number, number] {
  const alpha = top[3] ?? 1;
  const t = toRgb(top);
  const b = toRgb(bottom);
  return [0, 1, 2].map((i) => t[i] * alpha + b[i] * (1 - alpha)) as [number, number, number];
}

// WCAG relative luminance of a gamma-encoded sRGB colour.
export function luminance([r, g, b]: [number, number, number]) {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: [number, number, number], b: [number, number, number]) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

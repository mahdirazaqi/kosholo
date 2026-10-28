"use client";

// Outside-the-page unread indicators: the installed app's icon badge and the
// favicon. Both are driven by the unread total from the realtime store (see
// useUnreadIndicators) and redrawn at most once per second.

const THROTTLE_MS = 1000;

// Leading + trailing throttle that always ends on the latest value.
function throttled<T>(apply: (value: T) => void) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T;
  const run = () => {
    timer = null;
    last = Date.now();
    apply(latest);
  };
  const call = (value: T) => {
    latest = value;
    if (timer) return;
    const wait = last + THROTTLE_MS - Date.now();
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };
  const flush = (value: T) => {
    if (timer) clearTimeout(timer);
    latest = value;
    run();
  };
  return { call, flush };
}

// ---- App icon badge (installed PWA) ----
// Desktop Chrome/Edge: no permission needed. iOS/iPadOS 16.4+ (Home Screen
// app): only shown once notification permission is granted (see the profile
// setting). Android Chrome has no setAppBadge: a silent no-op.
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function applyAppBadge(total: number) {
  try {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return;
    const result = total > 0 ? nav.setAppBadge(total) : nav.clearAppBadge?.();
    void result?.catch(() => {});
  } catch {
    // Unsupported or not allowed: ignore.
  }
}
const appBadge = throttled(applyAppBadge);
export const updateAppBadge = appBadge.call;

// ---- Favicon badge (desktop browsers) ----
const SIZE = 64;
let originals: { link: HTMLLinkElement; href: string; type: string | null }[] | null = null;
let baseImage: Promise<HTMLImageElement | null> | null = null;

function iconLinks() {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
}

function loadBase() {
  baseImage ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/icons/favicon-32.png";
  });
  return baseImage;
}

async function applyFavicon(total: number) {
  try {
    // Phones and tablets have no favicon in view.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const links = iconLinks();
    if (links.length === 0) return;
    originals ??= links.map((link) => ({ link, href: link.href, type: link.getAttribute("type") }));

    if (total <= 0) return restoreFavicon();
    const image = await loadBase();
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, SIZE, SIZE);
    // Western digits on purpose: legible at 16–32px.
    const text = total > 99 ? "99+" : String(total);
    const radius = text.length > 2 ? 24 : text.length > 1 ? 21 : 19;
    const cx = SIZE - radius;
    const cy = radius;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = "#ef4444";
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `bold ${text.length > 2 ? 22 : 30}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, cx, cy + 1);
    const href = canvas.toDataURL("image/png");
    for (const link of links) {
      link.href = href;
      link.setAttribute("type", "image/png");
    }
  } catch {
    // Canvas unavailable: leave the favicon alone.
  }
}

function restoreFavicon() {
  if (!originals) return;
  for (const { link, href, type } of originals) {
    link.href = href;
    if (type) link.setAttribute("type", type);
    else link.removeAttribute("type");
  }
}
const favicon = throttled((total: number) => void applyFavicon(total));
export const updateFavicon = favicon.call;

// Logout / unmount: nothing of this account's count may stay behind.
export function clearBadges() {
  appBadge.flush(0);
  favicon.flush(0);
}

// ---- iOS: the badge needs notification permission ----
export function isIosStandalone() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && standalone;
}

// /~offline: what the service worker shows when a navigation fails offline.
// Deliberately plain HTML (inline CSS + a tiny script, no React): it must
// render from the precache alone, without any JS chunk. Public (see proxy.ts).
// It injects the same theme CSS and boot script as the app, so it shows the
// chosen theme.

import { bootScript } from "@/lib/appearance/boot";
import { themesCss } from "@/lib/appearance/themes";

const HTML = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Offline | Kosholo</title>
<link rel="icon" href="/favicon.ico">
<style>
  ${themesCss()}
  :root { --bg: var(--background); --fg: var(--foreground); --muted: var(--muted-foreground); --btn: var(--primary); --btn-fg: var(--primary-foreground); color-scheme: light; }
  :root.dark { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); display: flex; align-items: center; justify-content: center; padding: max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px); }
  main { display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; max-width: 22rem; }
  img { width: 72px; height: 72px; border-radius: 18px; }
  h1 { margin: 0; font-size: 1.125rem; font-weight: 700; }
  p { margin: 0; font-size: .875rem; line-height: 1.6; color: var(--muted); }
  a { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-radius: 12px; background: var(--btn); color: var(--btn-fg); font-size: 1rem; font-weight: 500; text-decoration: none; }
  a:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
</style>
<meta name="theme-color" content="">
<script>${bootScript()}</script>
<script>
  // The display mode (next-themes stores the choice in localStorage).
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || ((!t || t === "system") && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
  } catch (e) {}
  // Back online: retry the page that failed.
  addEventListener("online", function () { location.reload(); });
</script>
</head>
<body>
<main>
  <img src="/logo.svg" alt="Kosholo">
  <h1>You're offline</h1>
  <p>Check your connection. Your chats will update as soon as you're back online.</p>
  <a href="">Try again</a>
</main>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

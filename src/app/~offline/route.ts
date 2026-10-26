// /~offline: what the service worker shows when a navigation fails offline.
// Deliberately plain HTML (inline CSS + a tiny script, no React): it must
// render from the precache alone, without any JS chunk. Public (see proxy.ts).
// The font is copied to /fonts by scripts/build-sw.mjs and precached.

const HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>آفلاین | کوشولو</title>
<link rel="icon" href="/favicon.ico">
<style>
  @font-face { font-family: Vazirmatn; src: url(/fonts/vazirmatn.woff2) format("woff2"); font-weight: 100 900; font-display: swap; }
  :root { --bg: #fff; --fg: #171717; --muted: #737373; --tile: #f5f5f5; --btn: #171717; --btn-fg: #fafafa; color-scheme: light; }
  :root.dark { --bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --tile: #262626; --btn: #e5e5e5; --btn-fg: #171717; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
  body { font-family: Vazirmatn, system-ui, sans-serif; background: var(--bg); color: var(--fg); display: flex; align-items: center; justify-content: center; padding: max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px); }
  main { display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; max-width: 22rem; }
  img { width: 72px; height: 72px; border-radius: 18px; }
  h1 { margin: 0; font-size: 1.125rem; font-weight: 700; }
  p { margin: 0; font-size: .875rem; line-height: 1.75; color: var(--muted); }
  a { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-radius: 12px; background: var(--btn); color: var(--btn-fg); font-size: 1rem; font-weight: 500; text-decoration: none; }
  a:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
</style>
<script>
  // Same theme as the app (next-themes stores the choice in localStorage).
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
  <img src="/logo.svg" alt="کوشولو">
  <h1>اتصال اینترنت برقرار نیست</h1>
  <p>اتصال خود را بررسی کنید. به‌محض برقراری دوباره، گفتگوها به‌روز می‌شوند.</p>
  <a href="">تلاش دوباره</a>
</main>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

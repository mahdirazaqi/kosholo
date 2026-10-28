// Development only (loaded by NativeBehaviors when NODE_ENV=development).
// Logs every visible element that sticks out of the viewport horizontally, with
// a selector, so horizontal-overflow regressions are easy to find. Run it on
// every page at 320, 375 and 414px wide. Mark intentional overflow (a strip
// that scrolls on its own) with `.scroll-strip`, `.overflow-x-auto` or
// `data-allow-overflow`.
const IGNORED = ".scroll-strip, .overflow-x-auto, [data-allow-overflow], [data-scroll], [inert], [aria-hidden='true'], [data-state='closed'], .leaflet-container, .yarl__root";

function selectorOf(element: Element) {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && parts.length < 4) {
    const id = node.id ? `#${node.id}` : "";
    const classes = typeof node.className === "string" ? node.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    parts.unshift(`${node.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ""}`);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

export function startOverflowDetector() {
  const reported = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    const width = document.documentElement.clientWidth;
    for (const element of document.body.querySelectorAll("*")) {
      if (element.closest(IGNORED)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= width + 1 && rect.left >= -1) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || style.position === "fixed") continue;
      const key = `${width}:${selectorOf(element)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      console.warn(
        `[overflow] ${Math.round(rect.width)}px wide at ${Math.round(rect.left)}→${Math.round(rect.right)} in a ${width}px viewport:`,
        selectorOf(element),
        element,
      );
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, 400);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    if (timer) clearTimeout(timer);
  };
}

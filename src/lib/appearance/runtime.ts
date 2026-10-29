"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import {
  APPEARANCE_KEY,
  APPEARANCE_PENDING_KEY,
  type Appearance,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  sameAppearance,
} from "./settings";
import { type Mode, themeColorHex } from "./themes";

// The client side of appearance: one store the UI reads, the DOM attributes the
// CSS reads, a localStorage cache the boot script reads, and a small retry queue
// that saves changes to the account (works offline: it simply waits).
// The display mode stays with next-themes (per device).

const listeners = new Set<() => void>();
let current: Appearance | null = null;

function readCache(): Appearance {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}"));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export const getCurrentAppearance = () => (typeof window === "undefined" ? DEFAULT_APPEARANCE : (current ??= readCache()));

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_KEY) return;
    current = readCache();
    applyToDom(current);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppearance() {
  return useSyncExternalStore(subscribe, getCurrentAppearance, () => DEFAULT_APPEARANCE);
}

const isDark = () => document.documentElement.classList.contains("dark");

export function applyToDom(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.wallpaper = appearance.wallpaper;
  root.dataset.textSize = String(appearance.textSize);
  syncThemeColor(appearance.theme);
}

// The status bar follows the header colour of the current theme and mode.
function syncThemeColor(theme = getCurrentAppearance().theme) {
  const mode: Mode = isDark() ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColorHex(theme, mode));
}

// next-themes flips the .dark class: keep the status-bar colour in step.
export function watchMode() {
  const observer = new MutationObserver(() => syncThemeColor());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

// A short cross-fade where the browser supports it (and motion is allowed).
export function withTransition(change: () => void) {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    change();
    return;
  }
  start.call(document, () => flushSync(change));
}

function commit(next: Appearance) {
  current = next;
  applyToDom(next);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  } catch {
    // Not cached (private mode): still applies for this session.
  }
  for (const listener of listeners) listener();
}

// ---- Saving to the account ----

type Save = (appearance: Appearance) => Promise<{ ok: boolean }>;
let save: Save | null = null;
let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let inFlight = false;
const BACKOFF = [2000, 5000, 15000, 30000, 60000];

function readPending(): string | null {
  try {
    return localStorage.getItem(APPEARANCE_PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(value: string | null) {
  try {
    if (value) localStorage.setItem(APPEARANCE_PENDING_KEY, value);
    else localStorage.removeItem(APPEARANCE_PENDING_KEY);
  } catch {
    // ignore
  }
}

export const hasPendingChange = () => readPending() !== null;

export async function flushAppearance() {
  if (!save || !userId || inFlight) return;
  const pending = readPending();
  if (!pending) return;
  if (pending !== userId) {
    // A change queued by another account: never send it as this user's.
    writePending(null);
    return;
  }
  if (!navigator.onLine) return;
  inFlight = true;
  const sent = getCurrentAppearance();
  try {
    const result = await save(sent);
    if (result.ok) {
      attempts = 0;
      // A newer change made while this one was in flight keeps the queue.
      if (sameAppearance(sent, getCurrentAppearance())) writePending(null);
      else scheduleFlush(0);
      return;
    }
  } catch {
    // Offline or the server is unreachable: retry below.
  } finally {
    inFlight = false;
  }
  scheduleFlush(BACKOFF[Math.min(attempts++, BACKOFF.length - 1)]);
}

function scheduleFlush(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushAppearance(), delay);
}

// Called by <AppearanceSync> once the signed-in user is known.
export function connectAppearance(id: string, saveFn: Save) {
  userId = id;
  save = saveFn;
  void flushAppearance();
  return () => {
    if (timer) clearTimeout(timer);
    userId = null;
    save = null;
  };
}

export function setAppearance(patch: Partial<Appearance>) {
  const next = normalizeAppearance({ ...getCurrentAppearance(), ...patch });
  if (sameAppearance(next, getCurrentAppearance())) return;
  const visual = patch.theme !== undefined || patch.wallpaper !== undefined || patch.textSize !== undefined;
  const apply = () => commit(next);
  if (visual) withTransition(apply);
  else apply();
  if (userId) {
    writePending(userId);
    scheduleFlush(300);
  }
}

// The account's value (app start, reconnect, another device). The server wins,
// unless a change of mine is still waiting to be saved.
export function applyRemoteAppearance(remote: unknown) {
  if (hasPendingChange()) return;
  const next = normalizeAppearance(remote);
  if (sameAppearance(next, getCurrentAppearance())) return;
  withTransition(() => commit(next));
}

export function resetAppearance() {
  setAppearance(DEFAULT_APPEARANCE);
}

// Logout: the next user starts from the defaults until their own settings load.
export function clearAppearance() {
  current = DEFAULT_APPEARANCE;
  try {
    localStorage.removeItem(APPEARANCE_KEY);
    localStorage.removeItem(APPEARANCE_PENDING_KEY);
  } catch {
    // ignore
  }
  applyToDom(DEFAULT_APPEARANCE);
  for (const listener of listeners) listener();
}

// The display mode is next-themes' (per device); this wraps it in the same cross-fade.
export function useDisplayMode() {
  const { theme, setTheme } = useTheme();
  return {
    mode: (theme ?? "system") as "system" | "light" | "dark",
    setMode: (mode: "system" | "light" | "dark") => withTransition(() => setTheme(mode)),
  };
}

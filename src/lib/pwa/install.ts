"use client";

import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "@/lib/pwa/settings";

// Install support:
// - Chrome/Edge/Android fire `beforeinstallprompt`; we keep the event and show
//   our own banner / settings item instead of the browser's mini-infobar.
// - iOS Safari has no prompt: we show step-by-step instructions instead.
// - Nothing install-related shows when already running standalone.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

// The banner waits for the first interaction of the session (click, key or
// scroll): engagement first, and it never shifts the page while it loads.
const ENGAGED_KEY = "kosholo:engaged";
let engaged = false;

if (typeof window !== "undefined") {
  try {
    engaged = sessionStorage.getItem(ENGAGED_KEY) === "1";
  } catch {
    // ignore
  }
  if (!engaged) {
    const onEngage = () => {
      engaged = true;
      try {
        sessionStorage.setItem(ENGAGED_KEY, "1");
      } catch {
        // ignore
      }
      for (const type of ["click", "keydown", "scroll"]) window.removeEventListener(type, onEngage, true);
      emit();
    };
    for (const type of ["click", "keydown", "scroll"]) window.addEventListener(type, onEngage, { capture: true, passive: true });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const DISMISS_KEY = "kosholo:install-dismissed-at";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

export type InstallState = {
  standalone: boolean;
  ios: boolean;
  canPrompt: boolean;
  available: boolean; // something to offer (prompt or iOS instructions)
  dismissed: boolean; // banner dismissed in the last 14 days
  engaged: boolean; // the user has interacted this session
};

const SERVER_STATE: InstallState = {
  standalone: false,
  ios: false,
  canPrompt: false,
  available: false,
  dismissed: true,
  engaged: false,
};
let snapshot: InstallState = SERVER_STATE;

function compute(): InstallState {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const dismissedAt = Number(readStorage(DISMISS_KEY) ?? 0);
  const next: InstallState = {
    standalone,
    ios,
    canPrompt: deferred !== null,
    available: !standalone && (deferred !== null || ios),
    dismissed: Date.now() - dismissedAt < DISMISS_MS,
    engaged,
  };
  // Stable reference while nothing changed (useSyncExternalStore requirement).
  if (JSON.stringify(next) !== JSON.stringify(snapshot)) snapshot = next;
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState() {
  return useSyncExternalStore(subscribe, compute, () => SERVER_STATE);
}

export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  emit();
  return outcome === "accepted";
}

export function dismissInstallBanner() {
  writeStorage(DISMISS_KEY, String(Date.now()));
  emit();
}

"use client";

import { useSyncExternalStore } from "react";

// Per-device settings in localStorage (wrapped: storage can be unavailable,
// e.g. Safari private mode). Theme is handled by next-themes.
export type DeviceSettings = { sound: boolean; haptics: boolean };

const KEY = "kosholo:settings";
const DEFAULTS: DeviceSettings = { sound: true, haptics: true };

const listeners = new Set<() => void>();
let cached: DeviceSettings | null = null;

function read(): DeviceSettings {
  if (cached) return cached;
  try {
    cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cached = DEFAULTS;
  }
  return cached!;
}

export function getSettings() {
  return typeof window === "undefined" ? DEFAULTS : read();
}

export function updateSettings(patch: Partial<DeviceSettings>) {
  cached = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Not persisted; still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cached = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDeviceSettings() {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

// Small localStorage helpers for dismissals etc.
export function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

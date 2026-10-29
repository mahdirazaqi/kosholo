"use client";

import { useSyncExternalStore } from "react";

// Which incoming voice messages I've played, kept on this device only
// (IndexedDB, keyed by message id). The whole key set is loaded once; a bubble
// reads it synchronously. Without IndexedDB (private mode) it's in memory.
const DB_NAME = "kosholo-played";
const STORE = "voice";

let played = new Set<string>();
let started = false;
let ready = false;
const listeners = new Set<() => void>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function notify() {
  played = new Set(played);
  for (const listener of listeners) listener();
}

async function load() {
  if (started) return;
  started = true;
  const db = await open();
  if (!db) {
    ready = true;
    return notify();
  }
  const keys = await new Promise<IDBValidKey[]>((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
  db.close();
  for (const key of keys) played.add(String(key));
  ready = true;
  notify();
}

export function markPlayed(messageId: string) {
  if (played.has(messageId)) return;
  played.add(messageId);
  notify();
  void open().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put(true, messageId);
    } catch {
      // storage unavailable: stays in memory
    }
    db.close();
  });
}

// Logout: forget what the previous account played.
export function clearPlayed() {
  played = new Set();
  started = false;
  ready = false;
  notify();
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // nothing to clear
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => listeners.delete(listener);
}

// true until the message is played. `unknown` (still loading) counts as played
// so the dot never flashes for something already heard.
export function useIsUnplayed(messageId: string, enabled: boolean) {
  return useSyncExternalStore(
    subscribe,
    () => enabled && ready && !played.has(messageId),
    () => false,
  );
}

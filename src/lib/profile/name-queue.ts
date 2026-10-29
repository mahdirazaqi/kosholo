"use client";

import { useSyncExternalStore } from "react";

// Editing my name works offline: the new name is shown at once, kept in
// localStorage (with the user id) until the server has it, and sent again when
// the connection is back (online, tab visible, start). The server value wins as
// soon as nothing is pending.

const KEY = "kosholo:name-pending";
type Pending = { userId: string; name: string };

const listeners = new Set<() => void>();
let saved: string | null = null; // the name the server confirmed in this session

function read(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

const emit = () => listeners.forEach((l) => l());

let cache: { raw: string | null; pending: Pending | null } = { raw: null, pending: null };
function snapshot() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // ignore
  }
  if (raw !== cache.raw) cache = { raw, pending: raw ? read() : null };
  return cache.pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// The name to show: a pending (or just saved) edit, else the server's.
export function useDisplayName(userId: string, serverName: string) {
  const pending = useSyncExternalStore(subscribe, snapshot, () => null);
  const savedName = useSyncExternalStore(subscribe, () => saved, () => null);
  return pending && pending.userId === userId ? pending.name : (savedName ?? serverName);
}

export const hasPendingName = () => snapshot() !== null;

type Send = (name: string) => Promise<{ ok: boolean; error?: string }>;
let send: Send | null = null;
let userId: string | null = null;
let busy = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
const BACKOFF = [2000, 5000, 15000, 30000, 60000];

export async function flushName() {
  if (!send || !userId || busy) return;
  const pending = snapshot();
  if (!pending) return;
  if (pending.userId !== userId) {
    localStorage.removeItem(KEY);
    return emit();
  }
  if (!navigator.onLine) return;
  busy = true;
  try {
    const result = await send(pending.name);
    // A refused name (validation) is dropped, not retried forever.
    if (result.ok || result.error) {
      if (result.ok) saved = pending.name;
      const latest = snapshot();
      if (latest?.name === pending.name) localStorage.removeItem(KEY);
      attempts = 0;
      emit();
      if (!result.ok) {
        const { toast } = await import("sonner");
        toast.error(result.error ?? "Couldn't save your name");
      }
      return;
    }
  } catch {
    // Offline or unreachable: retry below.
  } finally {
    busy = false;
  }
  timer = setTimeout(() => void flushName(), BACKOFF[Math.min(attempts++, BACKOFF.length - 1)]);
}

export function queueName(id: string, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId: id, name } satisfies Pending));
  } catch {
    // Not persisted (private mode): still sent from memory below.
  }
  saved = null;
  emit();
  void flushName();
}

export function connectName(id: string, sendFn: Send) {
  userId = id;
  send = sendFn;
  void flushName();
  return () => {
    if (timer) clearTimeout(timer);
    send = null;
    userId = null;
  };
}

"use client";

import { FILE_CHUNK_SIZE } from "@/lib/media/limits";
import {
  FILE_UPLOAD_BASE,
  type ChunkResponse,
  type CompleteResponse,
  type CreateSessionResponse,
  type SessionStatusResponse,
} from "@/lib/upload/protocol";
import type { ChatMedia } from "@/lib/types/chat";

// Resumable FILE uploads (protocol: lib/upload/protocol.ts). Each file is sent
// in chunks (File.slice + XHR, for progress inside a chunk), one chunk at a
// time; at most MAX_PARALLEL files upload at once, the rest wait in a queue.
// Network errors, timeouts and 5xx retry with backoff; 409 resumes from the
// server's position; going offline pauses until the `online` event. Active
// sessions are kept in localStorage so a reload can resume (the file must be
// picked again: browsers don't keep File objects across reloads).

const MAX_PARALLEL = 2;
const BACKOFF_MS = [1000, 2000, 5000, 10_000];
const BACKOFF_MAX_MS = 15_000;
const CHUNK_TIMEOUT_MS = 5 * 60_000; // slow mobile links: 8 MB at ~30 KB/s
const STORAGE_KEY = "kosholo:file-uploads";

export type UploadPhase = "uploading" | "waiting" | "completing";
export type UploadProgress = { phase: UploadPhase; sent: number; total: number };

export class UploadCancelledError extends Error {}
// The server refused (4xx other than 409): retrying won't help.
export class UploadRejectedError extends Error {}

// ---- Persistence (per device) ----

export type PersistedUpload = {
  sessionId: string;
  conversationId: string;
  tempId: string;
  name: string;
  size: number;
  lastModified: number;
  mime: string;
  caption: string | null;
  replyToId: string | null;
  createdAt: string; // the optimistic bubble's time
};

function readAll(): PersistedUpload[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: PersistedUpload[]) {
  try {
    if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / quota: resuming after a reload just won't be offered.
  }
}

export function persistedUploads(conversationId: string) {
  return readAll().filter((entry) => entry.conversationId === conversationId);
}

function remember(entry: PersistedUpload) {
  writeAll([...readAll().filter((e) => e.tempId !== entry.tempId), entry]);
}

export function forgetUpload(tempId: string) {
  writeAll(readAll().filter((entry) => entry.tempId !== tempId));
}

export const sameFile = (file: File, entry: Pick<PersistedUpload, "name" | "size" | "lastModified">) =>
  file.name === entry.name && file.size === entry.size && file.lastModified === entry.lastModified;

// ---- Queue (MAX_PARALLEL at once) ----

let running = 0;
const queue: (() => void)[] = [];

function acquireSlot(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      if (signal.aborted) return void next();
      running++;
      void wakeLock.update();
      resolve();
    };
    signal.addEventListener("abort", () => {
      const index = queue.indexOf(start);
      if (index !== -1) queue.splice(index, 1);
      reject(new UploadCancelledError("cancelled"));
    }, { once: true });
    if (running < MAX_PARALLEL) start();
    else queue.push(start);
  });
}

function releaseSlot() {
  running = Math.max(0, running - 1);
  void wakeLock.update();
  next();
}

function next() {
  if (running < MAX_PARALLEL) queue.shift()?.();
}

// ---- Screen wake lock while anything uploads (where supported) ----

const wakeLock = {
  sentinel: null as WakeLockSentinel | null,
  listening: false,
  async update() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (!this.listening) {
      this.listening = true;
      // The lock is dropped whenever the page is hidden; take it again on return.
      document.addEventListener("visibilitychange", () => void this.update());
    }
    if (running > 0 && !this.sentinel && document.visibilityState === "visible") {
      try {
        this.sentinel = await navigator.wakeLock.request("screen");
        this.sentinel.addEventListener("release", () => (this.sentinel = null), { once: true });
      } catch {
        // Denied (battery saver, unsupported context): uploads continue anyway.
      }
    } else if (running === 0 && this.sentinel) {
      const sentinel = this.sentinel;
      this.sentinel = null;
      await sentinel.release().catch(() => {});
    }
  },
};

// ---- Helpers ----

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

// Resolves after `ms`, or as soon as the browser is back online; rejects on cancel.
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      reject(new UploadCancelledError("cancelled"));
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Offline: wait for `online` (no timer).
function untilOnline(signal: AbortSignal) {
  if (!isOffline()) return Promise.resolve();
  return wait(24 * 60 * 60_000, signal);
}

class RetryableError extends Error {}

async function requestJson<T>(url: string, init: RequestInit, signal: AbortSignal): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal, cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw new UploadCancelledError("cancelled");
    throw new RetryableError(error instanceof Error ? error.message : "network error");
  }
  if (response.status >= 500 || response.status === 408) throw new RetryableError(`HTTP ${response.status}`);
  const body = (await response.json().catch(() => null)) as T | null;
  if (!body) throw new RetryableError("bad response");
  return { status: response.status, body };
}

type ChunkResult = { status: number; body: ChunkResponse | null };

function putChunk(url: string, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void) {
  return new Promise<ChunkResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.responseType = "json";
    xhr.timeout = CHUNK_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 500 || xhr.status === 408) reject(new RetryableError(`HTTP ${xhr.status}`));
      else resolve({ status: xhr.status, body: xhr.response as ChunkResponse | null });
    };
    xhr.onerror = () => reject(new RetryableError("network error"));
    xhr.ontimeout = () => reject(new RetryableError("timeout"));
    let lostConnection = false;
    xhr.onabort = () =>
      reject(lostConnection ? new RetryableError("offline") : new UploadCancelledError("cancelled"));
    const abort = () => xhr.abort();
    // Some browsers keep a dead request hanging when the connection drops.
    const offline = () => {
      lostConnection = true;
      xhr.abort();
    };
    signal.addEventListener("abort", abort, { once: true });
    window.addEventListener("offline", offline);
    xhr.onloadend = () => {
      signal.removeEventListener("abort", abort);
      window.removeEventListener("offline", offline);
    };
    xhr.send(blob);
  });
}

// ---- Upload ----

export type UploadHandle = {
  promise: Promise<ChatMedia>;
  // Cancel: stop and delete the session on the server (and forget it locally).
  cancel: () => void;
  // Stop without deleting (e.g. the chat unmounts): resumable later.
  detach: () => void;
};

export type UploadOptions = {
  conversationId: string;
  tempId: string;
  caption: string | null;
  replyToId: string | null;
  createdAt: string;
  sessionId?: string; // resume this session instead of creating one
  onProgress: (progress: UploadProgress) => void;
};

export function startUpload(file: File, options: UploadOptions): UploadHandle {
  const controller = new AbortController();
  const { signal } = controller;
  let sessionId = options.sessionId ?? null;
  let deleteOnAbort = false;

  const promise = (async () => {
    await acquireSlot(signal);
    try {
      return await run();
    } finally {
      releaseSlot();
    }
  })().catch((error) => {
    if (deleteOnAbort && sessionId) {
      void fetch(`${FILE_UPLOAD_BASE}/${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    if (deleteOnAbort || error instanceof UploadRejectedError) forgetUpload(options.tempId);
    throw error;
  });

  // Retries `step` on network problems with backoff; waits while offline.
  async function retrying<T>(step: () => Promise<T>, sent: () => number): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (isOffline()) options.onProgress({ phase: "waiting", sent: sent(), total: file.size });
      await untilOnline(signal);
      try {
        return await step();
      } catch (error) {
        if (!(error instanceof RetryableError)) throw error;
        options.onProgress({ phase: "waiting", sent: sent(), total: file.size });
        await wait(BACKOFF_MS[attempt] ?? BACKOFF_MAX_MS, signal);
      }
    }
  }

  async function run(): Promise<ChatMedia> {
    let offset = 0;
    options.onProgress({ phase: "uploading", sent: 0, total: file.size });

    if (sessionId) {
      const id = sessionId;
      const { body } = await retrying(
        () => requestJson<SessionStatusResponse>(`${FILE_UPLOAD_BASE}/${id}`, { method: "GET" }, signal),
        () => 0,
      );
      if (!body.ok) throw new UploadRejectedError("This upload has expired; send the file again");
      offset = body.receivedSize;
    } else {
      const { body } = await retrying(
        () =>
          requestJson<CreateSessionResponse>(
            FILE_UPLOAD_BASE,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: file.name, size: file.size, mime: file.type || "application/octet-stream" }),
            },
            signal,
          ),
        () => 0,
      );
      if (!body.ok) throw new UploadRejectedError(body.error);
      sessionId = body.sessionId;
      offset = body.receivedSize;
      remember({
        sessionId,
        conversationId: options.conversationId,
        tempId: options.tempId,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        mime: file.type || "application/octet-stream",
        caption: options.caption,
        replyToId: options.replyToId,
        createdAt: options.createdAt,
      });
    }

    const id = sessionId;
    while (offset < file.size) {
      const start = offset;
      const end = Math.min(file.size, start + FILE_CHUNK_SIZE);
      options.onProgress({ phase: "uploading", sent: start, total: file.size });
      const { status, body } = await retrying(
        () =>
          putChunk(`${FILE_UPLOAD_BASE}/${id}?offset=${start}`, file.slice(start, end), signal, (loaded) =>
            options.onProgress({ phase: "uploading", sent: start + loaded, total: file.size }),
          ),
        () => start,
      );
      if (body?.ok) {
        offset = body.receivedSize;
      } else if (status === 409 && typeof body?.receivedSize === "number") {
        // Out of sync (e.g. a chunk landed but its response was lost): continue from the server.
        offset = body.receivedSize;
      } else {
        throw new UploadRejectedError(body?.error ?? "Couldn't send the file");
      }
    }

    options.onProgress({ phase: "completing", sent: file.size, total: file.size });
    const { body } = await retrying(
      () => requestJson<CompleteResponse>(`${FILE_UPLOAD_BASE}/${id}/complete`, { method: "POST" }, signal),
      () => file.size,
    );
    if (!body.ok) throw new UploadRejectedError(body.error);
    forgetUpload(options.tempId);
    return body.media;
  }

  return {
    promise,
    cancel: () => {
      deleteOnAbort = true;
      controller.abort();
    },
    detach: () => controller.abort(),
  };
}

// Cancels a persisted session that has no live upload (a paused bubble).
export function discardSession(entry: Pick<PersistedUpload, "sessionId" | "tempId">) {
  forgetUpload(entry.tempId);
  void fetch(`${FILE_UPLOAD_BASE}/${entry.sessionId}`, { method: "DELETE" }).catch(() => {});
}

// Bytes the server already has for a paused session (null if unknown/expired).
export async function sessionProgress(sessionId: string) {
  try {
    const response = await fetch(`${FILE_UPLOAD_BASE}/${sessionId}`, { cache: "no-store" });
    const body = (await response.json()) as SessionStatusResponse;
    return body.ok ? body.receivedSize : null;
  } catch {
    return null;
  }
}

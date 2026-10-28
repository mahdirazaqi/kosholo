"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { sendMessage } from "@/app/(app)/chats/actions";
import { tempId as newTempId } from "@/lib/client-utils";
import { mergeMessage } from "@/lib/realtime/client/merge";
import type { ChatMedia, ChatMessage, LocalUpload, ReplyPreview } from "@/lib/types/chat";
import {
  discardSession,
  persistedUploads,
  sameFile,
  sessionProgress,
  startUpload,
  UploadCancelledError,
  type PersistedUpload,
  type UploadHandle,
} from "@/lib/upload/resumable";
import type { PublicUser } from "@/lib/users";

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

type Entry = {
  record: Omit<PersistedUpload, "sessionId"> & { sessionId: string | null };
  file: File | null; // null for a paused upload restored after a reload
  objectUrl: string | null; // image preview
  handle: UploadHandle | null;
  media: ChatMedia | null; // set once `complete` succeeded (reused on retry)
  // Keeps selection order: uploads run in parallel, but each message is sent
  // only after the previous file finished (sent, failed or cancelled).
  previous: Promise<void>;
  finish: () => void;
};

// Files picked in this page session, by tempId: leaving a chat and coming back
// resumes them without asking for the file again (only a reload loses them).
const liveFiles = new Map<string, File>();

// Optimistic FILE messages: a bubble right away, the original bytes uploaded
// with the resumable protocol (lib/upload/resumable.ts), then
// sendMessage({ uploadId, tempId }). The message only exists on the server
// after `complete`; until then it's the sender's optimistic bubble.
export function useFileSender({
  conversationId,
  currentUser,
  setMessages,
}: {
  conversationId: string;
  currentUser: PublicUser;
  setMessages: SetMessages;
}) {
  const pending = useRef(new Map<string, Entry>());
  const lastFinished = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback(
    (id: string, update: (message: ChatMessage) => ChatMessage) =>
      setMessages((current) => current.map((m) => (m.tempId === id && m.status !== "sent" ? update(m) : m))),
    [setMessages],
  );
  const setLocal = useCallback(
    (id: string, local: LocalUpload | undefined, status: ChatMessage["status"] = "sending") =>
      patch(id, (m) => ({ ...m, local, status })),
    [patch],
  );

  const release = useCallback((id: string, delay = 0) => {
    const entry = pending.current.get(id);
    pending.current.delete(id);
    liveFiles.delete(id);
    entry?.finish();
    const url = entry?.objectUrl;
    if (url) setTimeout(() => URL.revokeObjectURL(url), delay);
  }, []);

  const deliver = useCallback(
    async (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      try {
        if (!entry.media) {
          const file = entry.file;
          if (!file) {
            setLocal(id, { phase: "paused", progress: 0, total: entry.record.size });
            return;
          }
          let shown = "";
          entry.handle = startUpload(file, {
            conversationId,
            tempId: id,
            caption: entry.record.caption,
            replyToId: entry.record.replyToId,
            createdAt: entry.record.createdAt,
            sessionId: entry.record.sessionId ?? undefined,
            onProgress: ({ phase, sent, total }) => {
              const progress = total ? sent / total : 0;
              // Re-render on phase changes and every 0.5%.
              const key = `${phase}:${Math.floor(progress * 200)}`;
              if (key === shown) return;
              shown = key;
              setLocal(id, { phase: phase === "completing" ? "processing" : phase, progress, sent, total });
            },
          });
          const media = await entry.handle.promise;
          entry.handle = null;
          entry.media = media;
          // Uploaded: keep the local image preview until the message is sent.
          patch(id, (m) => ({ ...m, local: undefined, media: { ...media, thumbUrl: media.thumbUrl ?? m.media?.thumbUrl ?? null } }));
        }

        await entry.previous;
        const result = await sendMessage({
          conversationId,
          content: entry.record.caption,
          uploadId: entry.media.id,
          replyToId: entry.record.replyToId,
          tempId: id,
        });
        if (!result.ok) throw new Error(result.error);
        setMessages((current) => mergeMessage(current, result.message, id));
        release(id, 5000);
      } catch (error) {
        entry.handle = null;
        if (error instanceof UploadCancelledError) return;
        setLocal(id, undefined, "failed");
        toast.error(error instanceof Error ? error.message : "Couldn't send the file");
        // Don't hold up later files; a retry sends without waiting.
        entry.finish();
        entry.previous = Promise.resolve();
      }
    },
    [conversationId, patch, release, setLocal, setMessages],
  );

  const add = useCallback(
    (entry: Omit<Entry, "handle" | "media" | "previous" | "finish">, replyTo: ReplyPreview | null, local: LocalUpload) => {
      const id = entry.record.tempId;
      let finish = () => {};
      const finished = new Promise<void>((resolve) => (finish = resolve));
      pending.current.set(id, { ...entry, handle: null, media: null, previous: lastFinished.current, finish });
      lastFinished.current = finished;
      const { record } = entry;
      const optimistic: ChatMessage = {
        id,
        tempId: id,
        conversationId,
        type: "FILE",
        content: record.caption,
        media: {
          id,
          kind: "FILE",
          url: "",
          thumbUrl: entry.objectUrl,
          mime: record.mime,
          width: null,
          height: null,
          duration: null,
          placeholder: null,
          waveform: null,
          originalName: record.name,
          size: record.size,
        },
        location: null,
        meta: null,
        createdAt: record.createdAt,
        sender: currentUser,
        replyTo,
        status: "sending",
        local,
      };
      // In createdAt order (restored bubbles can be older than loaded messages).
      setMessages((current) => {
        if (current.some((m) => m.tempId === id)) return current;
        let index = current.length;
        while (index > 0 && current[index - 1].createdAt > optimistic.createdAt) index--;
        return [...current.slice(0, index), optimistic, ...current.slice(index)];
      });
    },
    [conversationId, currentUser, setMessages],
  );

  // Each file is its own message; the caption and the reply go with the first.
  const sendDocuments = useCallback(
    (files: File[], caption: string | null, replyTo: ReplyPreview | null) => {
      files.forEach((file, index) => {
        const id = newTempId();
        liveFiles.set(id, file);
        const mime = file.type || "application/octet-stream";
        add(
          {
            record: {
              sessionId: null,
              conversationId,
              tempId: id,
              name: file.name,
              size: file.size,
              lastModified: file.lastModified,
              mime,
              caption: index === 0 ? caption : null,
              replyToId: index === 0 ? (replyTo?.id ?? null) : null,
              createdAt: new Date().toISOString(),
            },
            file,
            objectUrl: mime.startsWith("image/") ? URL.createObjectURL(file) : null,
          },
          index === 0 ? replyTo : null,
          { phase: "uploading", progress: 0, sent: 0, total: file.size },
        );
        void deliver(id);
      });
    },
    [add, conversationId, deliver],
  );

  // On open: uploads of this chat that didn't finish (reload, navigation).
  // With the File still in memory they continue; otherwise they wait, paused,
  // for the user to pick the same file again.
  useEffect(() => {
    const map = pending.current;
    for (const record of persistedUploads(conversationId)) {
      if (map.has(record.tempId)) continue;
      const file = liveFiles.get(record.tempId) ?? null;
      add(
        {
          record,
          file,
          objectUrl: file && record.mime.startsWith("image/") ? URL.createObjectURL(file) : null,
        },
        null,
        { phase: file ? "uploading" : "paused", progress: 0, total: record.size },
      );
      if (file) void deliver(record.tempId);
      else
        void sessionProgress(record.sessionId).then((sent) => {
          if (sent === null || !map.has(record.tempId)) return;
          setLocal(record.tempId, { phase: "paused", progress: sent / record.size, sent, total: record.size });
        });
    }
    return () => {
      // Leaving the chat: stop transfers but keep the sessions to resume later.
      for (const entry of map.values()) {
        entry.handle?.detach();
        if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      }
      map.clear();
    };
  }, [conversationId, add, deliver, setLocal]);

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.tempId) return;
      setLocal(message.tempId, { phase: "uploading", progress: 0, total: message.media?.size });
      void deliver(message.tempId);
    },
    [deliver, setLocal],
  );

  // Paused after a reload: ask for the file again (must run inside the click).
  const resume = useCallback(
    (message: ChatMessage) => {
      const id = message.tempId;
      const entry = id ? pending.current.get(id) : undefined;
      if (!id || !entry) return;
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!sameFile(file, entry.record)) {
          toast.error(`Pick the same file to continue: ${entry.record.name}`);
          return;
        }
        entry.file = file;
        liveFiles.set(id, file);
        if (!entry.objectUrl && entry.record.mime.startsWith("image/")) {
          entry.objectUrl = URL.createObjectURL(file);
          const url = entry.objectUrl;
          patch(id, (m) => (m.media ? { ...m, media: { ...m.media, thumbUrl: url } } : m));
        }
        void deliver(id);
      };
      input.click();
    },
    [deliver, patch],
  );

  // Cancel: stop, delete the server session and drop the bubble (no message is created).
  const cancel = useCallback(
    (message: ChatMessage) => {
      const id = message.tempId;
      const entry = id ? pending.current.get(id) : undefined;
      if (!id) return;
      if (entry?.handle) entry.handle.cancel();
      else if (entry?.record.sessionId && !entry.media) discardSession({ sessionId: entry.record.sessionId, tempId: id });
      setMessages((current) => current.filter((m) => m.tempId !== id));
      release(id);
    },
    [release, setMessages],
  );

  const isPending = useCallback((id: string | undefined) => Boolean(id && pending.current.has(id)), []);

  return useMemo(
    () => ({ sendDocuments, cancel, retry, resume, isPending }),
    [sendDocuments, cancel, retry, resume, isPending],
  );
}

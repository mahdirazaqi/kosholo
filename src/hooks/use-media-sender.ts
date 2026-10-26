"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { sendMessage } from "@/app/(app)/chats/actions";
import { tempId as newTempId } from "@/lib/client-utils";
import type { PreparedFile } from "@/lib/media/client/prepare";
import { uploadFile, UploadAbortedError } from "@/lib/media/client/upload";
import { mergeMessage } from "@/lib/realtime/client/merge";
import type { ChatMedia, ChatMessage, LocalUpload, ReplyPreview, UploadKind } from "@/lib/types/chat";
import type { PublicUser } from "@/lib/users";

type Pending = {
  file: Blob;
  filename: string;
  kind: Exclude<UploadKind, "AVATAR">;
  caption: string | null;
  replyToId: string | null;
  extra?: Record<string, string>;
  objectUrl: string;
  controller: AbortController | null;
  media: ChatMedia | null; // set once uploaded (reused on retry)
  // Keeps selection order: uploads run in parallel, but each message is sent
  // only after the previous file finished (sent, failed or cancelled).
  previous: Promise<void>;
  finish: () => void;
};

export type VoiceRecording = { blob: Blob; duration: number; waveform: number[] };

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

// Optimistic media sending: every file becomes its own bubble immediately
// (local object URL + progress), is uploaded with XHR (progress, abort), then
// sent with sendMessage({ uploadId, tempId }). The server message replaces the
// optimistic one through the same merge rule as text (lib/realtime/client/merge.ts).
export function useMediaSender({
  conversationId,
  currentUser,
  setMessages,
}: {
  conversationId: string;
  currentUser: PublicUser;
  setMessages: SetMessages;
}) {
  const pending = useRef(new Map<string, Pending>());
  const lastFinished = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback(
    (id: string, update: (message: ChatMessage) => ChatMessage) =>
      setMessages((current) => current.map((m) => (m.tempId === id && m.status !== "sent" ? update(m) : m))),
    [setMessages],
  );

  const release = useCallback((id: string, delay = 0) => {
    const entry = pending.current.get(id);
    pending.current.delete(id);
    entry?.finish();
    // Delay so the bubble can swap to the server image before the blob URL goes away.
    if (entry) setTimeout(() => URL.revokeObjectURL(entry.objectUrl), delay);
  }, []);

  const deliver = useCallback(
    async (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      const setLocal = (local: LocalUpload | undefined) => patch(id, (m) => ({ ...m, local, status: "sending" }));

      try {
        if (!entry.media) {
          setLocal({ phase: "uploading", progress: 0 });
          entry.controller = new AbortController();
          let shown = -1;
          entry.media = await uploadFile(entry.file, entry.kind, {
            signal: entry.controller.signal,
            filename: entry.filename,
            extra: entry.extra,
            onProgress: (fraction) => {
              const step = Math.floor(fraction * 50) / 50; // re-render every 2%
              if (step !== shown) {
                shown = step;
                setLocal({ phase: "uploading", progress: step });
              }
            },
            onUploaded: () => setLocal({ phase: "processing", progress: 1 }),
          });
          entry.controller = null;
          // Uploaded: no more cancelling; show the server's processed media.
          const media = entry.media;
          patch(id, (m) => ({ ...m, local: undefined, media }));
        }

        await entry.previous;
        const result = await sendMessage({
          conversationId,
          content: entry.caption,
          uploadId: entry.media.id,
          replyToId: entry.replyToId,
          tempId: id,
        });
        if (!result.ok) throw new Error(result.error);
        setMessages((current) => mergeMessage(current, result.message, id));
        release(id, 5000);
      } catch (error) {
        if (error instanceof UploadAbortedError) return;
        patch(id, (m) => ({ ...m, local: undefined, status: "failed" }));
        toast.error(error instanceof Error ? error.message : "ارسال فایل انجام نشد");
        // Don't hold up later files; a retry sends without waiting.
        entry.finish();
        entry.previous = Promise.resolve();
      }
    },
    [conversationId, patch, release, setMessages],
  );

  const enqueue = useCallback(
    (
      entry: Omit<Pending, "controller" | "media" | "previous" | "finish">,
      media: Omit<ChatMedia, "id" | "url" | "kind">,
      replyTo: ReplyPreview | null,
    ) => {
      const id = newTempId();
      let finish = () => {};
      const finished = new Promise<void>((resolve) => (finish = resolve));
      pending.current.set(id, { ...entry, controller: null, media: null, previous: lastFinished.current, finish });
      lastFinished.current = finished;
      const optimistic: ChatMessage = {
        id,
        tempId: id,
        conversationId,
        type: entry.kind,
        content: entry.caption,
        media: { ...media, id, kind: entry.kind, url: entry.objectUrl },
        meta: null,
        createdAt: new Date().toISOString(),
        sender: currentUser,
        replyTo,
        status: "sending",
        local: { phase: "uploading", progress: 0 },
      };
      setMessages((current) => [...current, optimistic]);
      void deliver(id);
    },
    [conversationId, currentUser, deliver, setMessages],
  );

  // Each file is its own message; the caption goes with the first one.
  const sendFiles = useCallback(
    (files: PreparedFile[], caption: string | null, replyTo: ReplyPreview | null) => {
      files.forEach((item, index) =>
        enqueue(
          {
            file: item.file,
            filename: item.file.name,
            kind: item.kind,
            caption: index === 0 ? caption : null,
            replyToId: index === 0 ? (replyTo?.id ?? null) : null,
            objectUrl: item.previewUrl,
          },
          {
            thumbUrl: item.kind === "IMAGE" ? item.previewUrl : null,
            mime: item.file.type,
            width: item.width,
            height: item.height,
            duration: item.duration,
            placeholder: null,
            waveform: null,
          },
          index === 0 ? replyTo : null,
        ),
      );
    },
    [enqueue],
  );

  const sendVoice = useCallback(
    (recording: VoiceRecording, replyTo: ReplyPreview | null) => {
      const ext = recording.blob.type.includes("mp4") ? "m4a" : "webm";
      enqueue(
        {
          file: recording.blob,
          filename: `voice.${ext}`,
          kind: "VOICE",
          caption: null,
          replyToId: replyTo?.id ?? null,
          extra: { waveform: JSON.stringify(recording.waveform) },
          objectUrl: URL.createObjectURL(recording.blob),
        },
        {
          thumbUrl: null,
          mime: recording.blob.type,
          width: null,
          height: null,
          duration: recording.duration,
          placeholder: null,
          waveform: recording.waveform,
        },
        replyTo,
      );
    },
    [enqueue],
  );

  // Cancel while uploading/processing: abort and drop the bubble (no message is created).
  const cancel = useCallback(
    (message: ChatMessage) => {
      const id = message.tempId;
      if (!id) return;
      pending.current.get(id)?.controller?.abort();
      setMessages((current) => current.filter((m) => m.tempId !== id));
      release(id);
    },
    [release, setMessages],
  );

  const isMediaPending = useCallback((id: string | undefined) => Boolean(id && pending.current.has(id)), []);

  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const entry of map.values()) {
        entry.controller?.abort();
        URL.revokeObjectURL(entry.objectUrl);
      }
      map.clear();
    };
  }, []);

  return { sendFiles, sendVoice, retry: deliver, cancel, isMediaPending };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { VoiceRecording } from "@/hooks/use-media-sender";
import { MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, WAVEFORM_BARS } from "@/lib/media/limits";

export type RecorderState = "idle" | "starting" | "recording";

const SAMPLE_MS = 50;

// MediaRecorder + AnalyserNode: live levels while recording. The peaks only
// feed the optimistic bubble; the stored waveform is computed by the server
// from the final file. Prefers audio/mp4 (Safari), else webm/opus; the
// server converts everything to M4A so it plays everywhere.
export function useVoiceRecorder(onComplete: (recording: VoiceRecording) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const session = useRef<{
    stream: MediaStream;
    recorder: MediaRecorder;
    context: AudioContext;
    chunks: Blob[];
    peaks: number[];
    startedAt: number;
    send: boolean;
    raf: number;
    timer: ReturnType<typeof setInterval>;
  } | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  // A start that's still awaiting permission when the user lets go.
  const cancelled = useRef(false);

  const teardown = useCallback(() => {
    const current = session.current;
    if (!current) return;
    cancelAnimationFrame(current.raf);
    clearInterval(current.timer);
    // Release the microphone.
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context.close().catch(() => {});
  }, []);

  const stop = useCallback(
    (send: boolean) => {
      cancelled.current = true;
      const current = session.current;
      if (!current) return;
      current.send = send;
      if (current.recorder.state !== "inactive") current.recorder.stop();
      else teardown();
    },
    [teardown],
  );

  const start = useCallback(async () => {
    if (session.current || state !== "idle") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording isn't available in this browser. The site must be opened over HTTPS.");
      return;
    }
    cancelled.current = false;
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      setState("idle");
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      toast.error(
        denied
          ? "Microphone access was denied. Allow it for this site in your browser settings."
          : "No microphone was found, or it isn't available.",
      );
      return;
    }
    if (cancelled.current) {
      stream.getTracks().forEach((track) => track.stop());
      setState("idle");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    const current = {
      stream,
      recorder,
      context,
      chunks: [] as Blob[],
      peaks: [] as number[],
      startedAt: performance.now(),
      send: false,
      raf: 0,
      timer: 0 as unknown as ReturnType<typeof setInterval>,
    };
    session.current = current;

    let windowPeak = 0;
    let lastSample = performance.now();
    const sample = () => {
      analyser.getByteTimeDomainData(buffer);
      for (const value of buffer) windowPeak = Math.max(windowPeak, Math.abs(value - 128) / 128);
      const now = performance.now();
      if (now - lastSample >= SAMPLE_MS) {
        const level = Math.min(1, windowPeak * 1.6);
        current.peaks.push(level);
        setLevels((previous) => [...previous.slice(-39), level]);
        windowPeak = 0;
        lastSample = now;
      }
      current.raf = requestAnimationFrame(sample);
    };
    current.raf = requestAnimationFrame(sample);

    current.timer = setInterval(() => {
      const seconds = (performance.now() - current.startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_VOICE_SECONDS) stop(true); // auto-stop and send at 5 minutes
    }, 200);

    recorder.ondataavailable = (event) => {
      if (event.data.size) current.chunks.push(event.data);
    };
    recorder.onstop = () => {
      const duration = (performance.now() - current.startedAt) / 1000;
      teardown();
      session.current = null;
      setState("idle");
      setElapsed(0);
      setLevels([]);
      if (!current.send) return;
      if (duration < MIN_VOICE_SECONDS) return; // too short: discard silently
      const blob = new Blob(current.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      onCompleteRef.current({ blob, duration: Math.min(duration, MAX_VOICE_SECONDS), waveform: summarize(current.peaks) });
    };
    recorder.start(250);
    setState("recording");
  }, [state, stop, teardown]);

  useEffect(() => () => stop(false), [stop]);

  return { state, elapsed, levels, start, stop };
}

// Peak per bar, normalized so the loudest bar is 1 (optimistic bubble only).
function summarize(peaks: number[]): number[] {
  if (peaks.length === 0) return Array(WAVEFORM_BARS).fill(0.1);
  const bars = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const start = Math.floor((i * peaks.length) / WAVEFORM_BARS);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / WAVEFORM_BARS));
    return Math.max(...peaks.slice(start, end));
  });
  const max = Math.max(...bars, 0.01);
  return bars.map((bar) => Math.round(Math.max(0.05, bar / max) * 100) / 100);
}

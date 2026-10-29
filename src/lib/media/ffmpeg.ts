// System ffmpeg/ffprobe via child_process (no bundled binaries). Paths are
// configurable with FFMPEG_PATH / FFPROBE_PATH. No "server-only": the custom
// server checks the binaries at startup.
import { spawn } from "node:child_process";

export const ffmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";
export const ffprobePath = () => process.env.FFPROBE_PATH || "ffprobe";

const MAX_CONCURRENT = 2;
// Per job; a job past this is killed. FFMPEG_TIMEOUT_SECONDS overrides it.
const JOB_TIMEOUT_MS = (Number(process.env.FFMPEG_TIMEOUT_SECONDS) || 120) * 1000;

export class FfmpegTimeoutError extends Error {}
const globalForQueue = globalThis as unknown as { __ffmpegQueue?: { running: number; waiting: (() => void)[] } };
const queue = (globalForQueue.__ffmpegQueue ??= { running: 0, waiting: [] });

// At most MAX_CONCURRENT ffmpeg processes at once (they're CPU heavy).
async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (queue.running >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.waiting.push(resolve));
  queue.running++;
  try {
    return await work();
  } finally {
    queue.running--;
    queue.waiting.shift()?.();
  }
}

function run(bin: string, args: string[], timeoutMs = JOB_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-4000)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new FfmpegTimeoutError(`${bin} timed out after ${timeoutMs / 1000}s`));
      else if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with ${code}: ${stderr}`));
    });
  });
}

export function ffmpeg(args: string[]) {
  return withSlot(() => run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args]));
}

export type ProbeResult = {
  duration: number | null;
  video: { codec: string; width: number; height: number; rotation: number } | null;
  audio: { codec: string } | null;
  format: string;
};

export async function ffprobe(file: string): Promise<ProbeResult> {
  const out = await run(ffprobePath(), [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file,
  ], 60_000);
  const data = JSON.parse(out) as {
    format?: { duration?: string; format_name?: string };
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      tags?: { rotate?: string };
      side_data_list?: { rotation?: number }[];
    }[];
  };
  const v = data.streams?.find((s) => s.codec_type === "video");
  const a = data.streams?.find((s) => s.codec_type === "audio");
  const rotation = Math.abs(
    Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0),
  );
  const duration = Number(data.format?.duration);
  return {
    duration: Number.isFinite(duration) ? duration : null,
    video: v && v.width && v.height ? { codec: v.codec_name ?? "", width: v.width, height: v.height, rotation } : null,
    audio: a ? { codec: a.codec_name ?? "" } : null,
    format: data.format?.format_name ?? "",
  };
}

// Startup check, logged by the custom server.
export async function checkMediaBinaries() {
  const missing: string[] = [];
  for (const bin of [ffmpegPath(), ffprobePath()]) {
    try {
      await run(bin, ["-version"], 10_000);
    } catch {
      missing.push(bin);
    }
  }
  return missing;
}

// Decodes `file` to mono signed 16-bit PCM at `rate` Hz and hands the raw
// bytes to `onData` as they arrive (nothing is buffered, so a long recording
// costs no memory). Capped at `maxSeconds` of audio.
export function ffmpegPcm(
  file: string,
  rate: number,
  maxSeconds: number,
  onData: (chunk: Buffer) => void,
): Promise<void> {
  return withSlot(
    () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpegPath(),
          ["-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-t", String(maxSeconds), "-ac", "1", "-ar", String(rate), "-f", "s16le", "pipe:1"],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let stderr = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), JOB_TIMEOUT_MS);
        child.stdout.on("data", onData);
        child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-2000)));
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
        });
      }),
  );
}

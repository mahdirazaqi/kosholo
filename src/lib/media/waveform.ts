// Waveform of a finished audio file, computed on the server from the FINAL
// file (never from client-side analyser data, which is all zeros on some
// devices). No "server-only": the backfill script imports it too.
import { ffmpegPcm } from "@/lib/media/ffmpeg";
import { WAVEFORM_BARS } from "@/lib/media/limits";
import { logger } from "@/lib/logger";

const RATE = 8000;
const WINDOW = 80; // samples per energy window (10 ms)
const MAX_SECONDS = 2 * 60 * 60;
// RMS below this (full scale = 1) counts as digital silence.
const SILENCE_RMS = 0.0015;
// What silent audio is stored as; the UI draws it as short rounded bars.
export const WAVEFORM_FLOOR = 0.05;

export const silentWaveform = () => Array<number>(WAVEFORM_BARS).fill(WAVEFORM_FLOOR);

// WAVEFORM_BARS equal buckets over the whole duration, RMS per bucket,
// relative to the loudest bucket of THIS recording, then a sqrt curve so quiet
// speech stays visible. Values are 0–1 with two decimals.
export async function computeWaveform(file: string): Promise<number[]> {
  const energy: number[] = []; // sum of squares per window
  let sum = 0;
  let inWindow = 0;
  let carry: number | null = null; // odd trailing byte of the previous chunk

  const add = (sample: number) => {
    sum += sample * sample;
    if (++inWindow < WINDOW) return;
    energy.push(sum);
    sum = 0;
    inWindow = 0;
  };

  await ffmpegPcm(file, RATE, MAX_SECONDS, (chunk) => {
    let offset = 0;
    if (carry !== null && chunk.length > 0) {
      add(((((chunk[0] << 8) | carry) << 16) >> 16) / 32768);
      carry = null;
      offset = 1;
    }
    const end = chunk.length - ((chunk.length - offset) % 2);
    for (let i = offset; i < end; i += 2) add(chunk.readInt16LE(i) / 32768);
    if (end < chunk.length) carry = chunk[end];
  });
  if (inWindow > 0) energy.push((sum / inWindow) * WINDOW);
  if (energy.length === 0) return silentWaveform();

  const rms = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const start = Math.floor((i * energy.length) / WAVEFORM_BARS);
    const stop = Math.max(start + 1, Math.floor(((i + 1) * energy.length) / WAVEFORM_BARS));
    let total = 0;
    for (let w = start; w < stop && w < energy.length; w++) total += energy[w];
    return Math.sqrt(total / ((stop - start) * WINDOW));
  });
  const peak = Math.max(...rms);
  if (peak < SILENCE_RMS) return silentWaveform();
  return rms.map((value) => Math.round(Math.min(1, Math.max(WAVEFORM_FLOOR, Math.sqrt(value / peak))) * 100) / 100);
}

// For uploads: a failed analysis must never fail the send.
export async function computeWaveformSafe(file: string): Promise<number[]> {
  try {
    return await computeWaveform(file);
  } catch (error) {
    logger.warn("media", "waveform failed", error);
    return silentWaveform();
  }
}

"use client";

// A short, soft two-note chime made with the Web Audio API (no file to load).
// Browsers only allow audio after a user gesture, so the context is created
// on the first tap/keypress (unlockAudio) and reused.
let context: AudioContext | null = null;

export function unlockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    // Web Audio unavailable.
  }
}

export function playNotificationSound() {
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const notes = [
    { frequency: 880, start: 0 },
    { frequency: 1318.5, start: 0.11 },
  ];
  for (const { frequency, start } of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.12, now + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + 0.25);
  }
}

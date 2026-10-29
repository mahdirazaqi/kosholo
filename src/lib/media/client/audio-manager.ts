"use client";

// One shared <audio> element for voice messages: starting a voice pauses the
// previous one, and when one ends playback simply stops. Players subscribe to
// the state with useSyncExternalStore.

type AudioState = {
  src: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  // Pressed play and waiting for the first audio.
  loading: boolean;
};

let audio: HTMLAudioElement | null = null;
let state: AudioState = { src: null, playing: false, currentTime: 0, duration: 0, rate: 1, loading: false };
const listeners = new Set<() => void>();

function emit(patch: Partial<AudioState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("play", () => emit({ playing: true }));
  audio.addEventListener("pause", () => emit({ playing: false, loading: false }));
  audio.addEventListener("waiting", () => emit({ loading: true }));
  audio.addEventListener("playing", () => emit({ loading: false }));
  audio.addEventListener("canplay", () => emit({ loading: false }));
  audio.addEventListener("error", () => emit({ playing: false, loading: false }));
  audio.addEventListener("timeupdate", () => emit({ currentTime: audio!.currentTime }));
  audio.addEventListener("loadedmetadata", () => emit({ duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 }));
  audio.addEventListener("ended", () => emit({ playing: false, loading: false, currentTime: 0 }));
  return audio;
}

export const audioManager = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: () => state,
  getServerState: () => state,

  // Plays `src` (from `at` seconds); pauses whatever else was playing.
  async play(src: string, at?: number) {
    const el = element();
    if (state.src !== src) {
      el.pause();
      el.src = src;
      emit({ src, currentTime: at ?? 0, duration: 0, loading: true });
    }
    el.playbackRate = state.rate;
    if (at !== undefined) el.currentTime = at;
    try {
      await el.play();
    } catch {
      emit({ playing: false, loading: false });
    }
  },
  pause() {
    audio?.pause();
  },
  seek(src: string, seconds: number) {
    if (state.src !== src) return void audioManager.play(src, seconds);
    element().currentTime = seconds;
    emit({ currentTime: seconds });
  },
  // A voice message was deleted: stop it if it's the one loaded.
  release(srcs: string[]) {
    if (!state.src || !srcs.includes(state.src)) return;
    audio?.pause();
    audio?.removeAttribute("src");
    emit({ src: null, playing: false, loading: false, currentTime: 0, duration: 0 });
  },
  // 1x → 1.5x → 2x → 1x, shared by all voices.
  cycleRate() {
    const rate = state.rate === 1 ? 1.5 : state.rate === 1.5 ? 2 : 1;
    if (audio) audio.playbackRate = rate;
    emit({ rate });
  },
};

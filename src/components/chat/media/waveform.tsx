"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { resampleWaveform } from "@/lib/media/waveform-shared";
import { cn } from "@/lib/utils";

// The one place that decides which way playback progress runs: the bars fill,
// and a tap/drag maps, from this side. It follows how the duration text reads
// (inline start), so flip it to "rtl" if the UI direction ever changes.
export const WAVEFORM_FLOW: "ltr" | "rtl" = "ltr";

const BAR = 3;
const GAP = 2;
const HEIGHT = 24;
const MIN_BAR = 5; // silent parts: short rounded bars, never dots
const MIN_COUNT = 12;

// A waveform that is also a seek bar: ONE svg (two paths) however many bars,
// sized by the container it lives in. `values` of any length are resampled to
// the bar count that fits the width; without values a plain progress track is
// drawn. Tap to seek, drag to scrub (once per frame).
export function Waveform({
  values,
  progress,
  onSeek,
  onStep,
  disabled,
  playedClass,
  restClass,
  label,
  valueNow,
  valueMax,
}: {
  values: number[] | null;
  progress: number; // 0–1
  onSeek: (fraction: number) => void;
  onStep: (seconds: number) => void;
  disabled?: boolean;
  playedClass: string; // text-* colour of the played part
  restClass: string; // text-* colour of the rest
  label: string;
  valueNow: number;
  valueMax: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const drag = useRef<{ raf: number; pending: number }>({ raf: 0, pending: 0 });
  const clipId = useId();
  const flip = WAVEFORM_FLOW === "rtl";

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      setWidth(Math.floor(element.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(() => {
      if (!raf) raf = requestAnimationFrame(measure);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const count = width ? Math.max(MIN_COUNT, Math.floor((width + GAP) / (BAR + GAP))) : 0;
  const path = useMemo(() => {
    if (!values || !count) return "";
    const bars = resampleWaveform(values, count);
    let d = "";
    for (let i = 0; i < count; i++) {
      const h = Math.min(HEIGHT, Math.max(MIN_BAR, (bars[i] || 0) * HEIGHT));
      const x = i * (BAR + GAP) + BAR / 2;
      const y = (HEIGHT - h) / 2 + BAR / 2;
      d += `M${x} ${y.toFixed(1)}V${(HEIGHT - y).toFixed(1)}`;
    }
    return d;
  }, [values, count]);

  const shown = Math.min(1, Math.max(0, scrub ?? progress));
  const usedWidth = count * (BAR + GAP) - GAP;

  function fractionAt(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return flip ? 1 - fraction : fraction;
  }
  function queue(fraction: number) {
    drag.current.pending = fraction;
    if (drag.current.raf) return;
    drag.current.raf = requestAnimationFrame(() => {
      drag.current.raf = 0;
      setScrub(drag.current.pending);
      onSeek(drag.current.pending);
    });
  }
  function release(event: React.PointerEvent) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    cancelAnimationFrame(drag.current.raf);
    drag.current.raf = 0;
    if (event.type === "pointerup") onSeek(fractionAt(event.clientX));
    setScrub(null);
  }

  return (
    <div
      ref={ref}
      dir={WAVEFORM_FLOW}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(event) => {
        if (disabled) return;
        // Scrubbing must never start a swipe-to-reply or a long press.
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const fraction = fractionAt(event.clientX);
        setScrub(fraction);
        queue(fraction);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) queue(fractionAt(event.clientX));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onStep(flip ? -5 : 5);
        if (event.key === "ArrowLeft") onStep(flip ? 5 : -5);
      }}
      className={cn("h-8 min-w-0 flex-1 touch-none overflow-hidden", disabled ? "cursor-default" : "cursor-pointer")}
    >
      {values ? (
        count > 0 && (
          <svg
            width={usedWidth}
            height={HEIGHT}
            viewBox={`0 0 ${usedWidth} ${HEIGHT}`}
            aria-hidden
            className={cn("mt-1 block max-w-full", flip && "-scale-x-100")}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={shown * usedWidth} height={HEIGHT} />
              </clipPath>
            </defs>
            <path d={path} strokeWidth={BAR} strokeLinecap="round" fill="none" stroke="currentColor" className={restClass} />
            <path
              d={path}
              strokeWidth={BAR}
              strokeLinecap="round"
              fill="none"
              stroke="currentColor"
              className={playedClass}
              clipPath={`url(#${clipId})`}
            />
          </svg>
        )
      ) : (
        <div className="relative top-[14px] h-1 overflow-hidden rounded-full">
          <div className={cn("absolute inset-0 rounded-full bg-current", restClass)} />
          <div
            className={cn("absolute inset-0 origin-[0_50%] rounded-full bg-current rtl:origin-[100%_50%]", playedClass)}
            style={{ transform: `scaleX(${shown})` }}
          />
        </div>
      )}
    </div>
  );
}

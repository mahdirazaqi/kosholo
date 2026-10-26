"use client";

import { X } from "lucide-react";
import type { LocalUpload } from "@/lib/types/chat";

// Circular progress with a cancel button, over an optimistic media bubble.
// While the server processes the file the ring spins instead.
export function UploadProgress({ upload, onCancel }: { upload: LocalUpload; onCancel: () => void }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const processing = upload.phase === "processing";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        aria-label={processing ? "در حال پردازش؛ لغو" : "لغو ارسال"}
        className="relative flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
      >
        <svg viewBox="0 0 44 44" className={processing ? "absolute inset-0 animate-spin" : "absolute inset-0 -rotate-90"}>
          <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={processing ? circumference * 0.7 : circumference * (1 - Math.max(0.03, upload.progress))}
            className="transition-[stroke-dashoffset] duration-200"
          />
        </svg>
        <X className="size-5" />
      </button>
      {processing && (
        <span className="absolute bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
          در حال پردازش…
        </span>
      )}
    </div>
  );
}

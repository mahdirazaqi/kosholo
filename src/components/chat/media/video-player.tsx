"use client";

import { Download, X } from "lucide-react";
import type { ViewerTarget } from "@/components/chat/media/media-viewer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Full-screen native player (playsInline, autoplay). Lazy-loaded.
export default function VideoPlayer({ target, onClose }: { target: Extract<ViewerTarget, { kind: "image" | "video" }>; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none bg-black p-0 ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Play video</DialogTitle>
        <video src={target.url} controls autoPlay playsInline className="max-h-full max-w-full" />
        <div className="absolute end-3 top-[max(env(safe-area-inset-top),0.75rem)] flex gap-2">
          <a
            href={target.url}
            download="kosholo-video.mp4"
            aria-label="Download"
            className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          >
            <Download className="size-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          >
            <X className="size-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

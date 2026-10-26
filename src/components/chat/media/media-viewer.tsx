"use client";

import { Download, X } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import DownloadPlugin from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type ViewerTarget = { kind: "image" | "video"; url: string; width: number | null; height: number | null } | null;

// Full-screen viewers: images in a lightbox (pinch/double-tap zoom, pull down
// to close, download); videos in a native player.
export function MediaViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  return (
    <>
      <Lightbox
        open={target?.kind === "image"}
        close={onClose}
        slides={
          target?.kind === "image"
            ? [{ src: target.url, width: target.width ?? undefined, height: target.height ?? undefined, download: { url: target.url, filename: "kosholo-image" } }]
            : []
        }
        plugins={[Zoom, DownloadPlugin]}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        controller={{ closeOnPullDown: true, closeOnBackdropClick: true }}
        zoom={{ maxZoomPixelRatio: 3, doubleTapDelay: 300 }}
        labels={{ Close: "بستن", Download: "دانلود", "Zoom in": "بزرگ‌نمایی", "Zoom out": "کوچک‌نمایی" }}
      />

      <Dialog open={target?.kind === "video"} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 top-0 start-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none bg-black p-0 ring-0 rtl:translate-x-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">پخش ویدیو</DialogTitle>
          {target?.kind === "video" && (
            <video src={target.url} controls autoPlay playsInline className="max-h-full max-w-full" />
          )}
          <div className="absolute end-3 top-[max(env(safe-area-inset-top),0.75rem)] flex gap-2">
            {target?.kind === "video" && (
              <a
                href={target.url}
                download="kosholo-video.mp4"
                aria-label="دانلود"
                className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
              >
                <Download className="size-5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
            >
              <X className="size-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

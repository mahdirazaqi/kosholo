"use client";

import Lightbox from "yet-another-react-lightbox";
import DownloadPlugin from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import type { ViewerTarget } from "@/components/chat/media/media-viewer";

// Lightbox: pinch/double-tap zoom, pull down to close, download. Lazy-loaded.
export default function ImageViewer({ target, onClose }: { target: Extract<ViewerTarget, { kind: "image" | "video" }>; onClose: () => void }) {
  return (
    <Lightbox
      open
      close={onClose}
      slides={[
        {
          src: target.url,
          width: target.width ?? undefined,
          height: target.height ?? undefined,
          download: { url: target.url, filename: "kosholo-image" },
        },
      ]}
      plugins={[Zoom, DownloadPlugin]}
      carousel={{ finite: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      controller={{ closeOnPullDown: true, closeOnBackdropClick: true }}
      zoom={{ maxZoomPixelRatio: 3, doubleTapDelay: 300 }}
      labels={{ Close: "Close", Download: "Download", "Zoom in": "Zoom in", "Zoom out": "Zoom out" }}
    />
  );
}

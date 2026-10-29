"use client";

import { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PROFILE_PHOTO_FULL } from "@/lib/media/limits";
import { formatNumber } from "@/lib/numbers";

// Square crop to a JPEG blob of at most 1280px (the server makes the sizes).
async function cropToBlob(src: string, area: Area | null): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Couldn't read this image"));
    element.src = src;
  });
  // No crop chosen (Skip): the centered square.
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const box = area ?? { x: (image.naturalWidth - side) / 2, y: (image.naturalHeight - side) / 2, width: side, height: side };
  const out = Math.min(PROFILE_PHOTO_FULL, Math.round(box.width));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas.getContext("2d")?.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't crop this image"))), "image/jpeg", 0.9),
  );
}

// Full-screen crop step, one image at a time ("2 of 3"): drag and pinch to
// position and zoom under a circular overlay; "Skip" uses the centered crop.
// Resolves with one blob per file (null = failed to read), in order.
export function PhotoCropper({
  files,
  onDone,
  onCancel,
}: {
  files: File[];
  onDone: (blobs: (Blob | null)[]) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(Blob | null)[]>([]);
  const last = index === files.length - 1;

  function finish(blob: Blob | null) {
    const next = [...results, blob];
    if (last) return onDone(next);
    setResults(next);
    setIndex(index + 1);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        showCloseButton={false}
        data-allow-zoom
        className="inset-0 top-0 start-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-viewer p-0 text-overlay-foreground ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Crop photo</DialogTitle>
        <DialogDescription className="sr-only">Drag and pinch to position the photo inside the circle</DialogDescription>
        <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
          <Button type="button" variant="ghost" size="icon-lg" aria-label="Cancel" onClick={onCancel} className="size-11 rounded-full text-overlay-foreground hover:bg-overlay-foreground/15">
            <X className="size-5" />
          </Button>
          {files.length > 1 && (
            <span aria-live="polite" className="text-sm font-medium">
              {formatNumber(index + 1)} of {formatNumber(files.length)}
            </span>
          )}
          <span className="size-11" />
        </div>
        {/* Remounted per image: fresh crop, zoom and object URL. */}
        <CropStep key={index} file={files[index]} last={last} onResult={finish} />
      </DialogContent>
    </Dialog>
  );
}

function CropStep({ file, last, onResult }: { file: File; last: boolean; onResult: (blob: Blob | null) => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  async function advance(useCrop: boolean) {
    if (busy) return;
    setBusy(true);
    let blob: Blob | null = null;
    try {
      blob = await cropToBlob(url, useCrop ? area : null);
    } catch {
      blob = null;
    }
    onResult(blob);
    setBusy(false);
  }

  return (
    <>
      <div className="relative min-h-0 flex-1 touch-none">
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => void advance(false)} className="h-12 rounded-xl border-overlay-foreground/30 bg-transparent text-base text-overlay-foreground hover:bg-overlay-foreground/10">
          Skip
        </Button>
        <Button type="button" size="lg" disabled={busy || !area} onClick={() => void advance(true)} className="h-12 rounded-xl text-base">
          {busy && <Loader2 className="animate-spin" />}
          {last ? "Save" : "Next"}
        </Button>
      </div>
    </>
  );
}

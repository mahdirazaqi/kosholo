"use client";

import { useId, useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PreparedFile } from "@/lib/media/client/prepare";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";
import { formatCount, formatNumber } from "@/lib/numbers";

// Full-screen preview of the selection: swipe through, remove items, add one
// caption (applied to the first file), send all. "Send without compression"
// sends the original files as FILE messages instead of the media pipeline.
export function MediaPreviewDialog({
  files,
  onChange,
  onSend,
}: {
  files: PreparedFile[];
  onChange: (files: PreparedFile[]) => void;
  onSend: (caption: string | null, asFiles: boolean) => void;
}) {
  const [caption, setCaption] = useState("");
  const [asFiles, setAsFiles] = useState(false);
  const switchId = useId();
  const open = files.length > 0;

  function close() {
    for (const file of files) URL.revokeObjectURL(file.previewUrl);
    onChange([]);
    setCaption("");
    setAsFiles(false);
  }

  function remove(index: number) {
    URL.revokeObjectURL(files[index].previewUrl);
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-viewer p-0 text-overlay-foreground ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
          <button
            type="button"
            onClick={close}
            aria-label="Cancel"
            className="flex size-11 items-center justify-center rounded-full hover:bg-overlay-foreground/10"
          >
            <X className="size-6" />
          </button>
          <DialogTitle className="text-base font-semibold text-overlay-foreground">
            {formatCount(files.length, "file")} selected
          </DialogTitle>
          <DialogDescription className="sr-only">Preview files before sending</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain">
          {files.map((file, index) => (
            <div key={file.previewUrl} className="relative flex w-full shrink-0 snap-center items-center justify-center p-4">
              {file.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img draggable={false} src={file.previewUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
              ) : (
                <video src={file.previewUrl} controls playsInline muted className="max-h-full max-w-full rounded-lg" />
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Remove from selection"
                className="absolute end-6 top-6 flex size-10 items-center justify-center rounded-full bg-viewer/60 hover:bg-viewer/80"
              >
                <X className="size-5" />
              </button>
              {files.length > 1 && (
                <span className="absolute start-6 top-6 rounded-full bg-viewer/60 px-2.5 py-1 text-xs">
                  {formatNumber(index + 1)} / {formatNumber(files.length)}
                </span>
              )}
            </div>
          ))}
        </div>

        <label
          htmlFor={switchId}
          className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 px-4 text-sm text-overlay-foreground/90"
        >
          <Switch
            id={switchId}
            checked={asFiles}
            onCheckedChange={setAsFiles}
            className="data-unchecked:bg-overlay-foreground/25"
          />
          Send without compression (as files)
        </label>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSend(caption.trim() || null, asFiles);
            setCaption("");
            setAsFiles(false);
          }}
          className="flex shrink-0 items-end gap-2 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        >
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={MAX_CAPTION_LENGTH}
            dir="auto"
            placeholder="Add a caption (optional)"
            aria-label="Caption"
            className="h-11 min-w-0 flex-1 rounded-full bg-overlay-foreground/10 px-4 text-base text-overlay-foreground outline-none placeholder:text-overlay-foreground/50 focus-visible:ring-2 focus-visible:ring-overlay-foreground/40"
          />
          <Button type="submit" size="lg" className="h-11 shrink-0 gap-2 rounded-full bg-overlay-foreground px-4 text-base text-viewer hover:bg-overlay-foreground/90">
            Send
            <SendHorizontal className="size-5 rtl:-scale-x-100" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

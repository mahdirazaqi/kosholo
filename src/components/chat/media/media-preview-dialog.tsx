"use client";

import { useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PreparedFile } from "@/lib/media/client/prepare";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";

// Full-screen preview of the selection: swipe through, remove items, add one
// caption (applied to the first file), send all.
export function MediaPreviewDialog({
  files,
  onChange,
  onSend,
}: {
  files: PreparedFile[];
  onChange: (files: PreparedFile[]) => void;
  onSend: (caption: string | null) => void;
}) {
  const [caption, setCaption] = useState("");
  const open = files.length > 0;

  function close() {
    for (const file of files) URL.revokeObjectURL(file.previewUrl);
    onChange([]);
    setCaption("");
  }

  function remove(index: number) {
    URL.revokeObjectURL(files[index].previewUrl);
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 rtl:translate-x-0 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
          <button
            type="button"
            onClick={close}
            aria-label="انصراف"
            className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
          <DialogTitle className="text-base font-semibold text-white">
            {files.length.toLocaleString("fa-IR")} فایل انتخاب شده
          </DialogTitle>
          <DialogDescription className="sr-only">پیش‌نمایش فایل‌ها قبل از ارسال</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain">
          {files.map((file, index) => (
            <div key={file.previewUrl} className="relative flex w-full shrink-0 snap-center items-center justify-center p-4">
              {file.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.previewUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
              ) : (
                <video src={file.previewUrl} controls playsInline muted className="max-h-full max-w-full rounded-lg" />
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="حذف از انتخاب"
                className="absolute end-6 top-6 flex size-10 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
              >
                <X className="size-5" />
              </button>
              {files.length > 1 && (
                <span className="absolute start-6 top-6 rounded-full bg-black/60 px-2.5 py-1 text-xs">
                  {(index + 1).toLocaleString("fa-IR")} / {files.length.toLocaleString("fa-IR")}
                </span>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSend(caption.trim() || null);
            setCaption("");
          }}
          className="flex shrink-0 items-end gap-2 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        >
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={MAX_CAPTION_LENGTH}
            dir="auto"
            placeholder="توضیح (اختیاری)"
            aria-label="توضیح"
            className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/40"
          />
          <Button type="submit" size="lg" className="h-11 shrink-0 gap-2 rounded-full bg-white px-4 text-base text-black hover:bg-white/90">
            ارسال
            <SendHorizontal className="size-5 rtl:-scale-x-100" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

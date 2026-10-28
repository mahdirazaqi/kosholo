"use client";

import { useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { shortFileName } from "@/components/chat/message-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MAX_CAPTION_LENGTH } from "@/lib/media/limits";
import { formatBytes, formatCount } from "@/lib/numbers";
import { FILE_KIND_STYLE, fileKind } from "@/lib/upload/file-kind";
import { cn } from "@/lib/utils";

// Documents picked with "File": a list (icon, name, size, remove), one
// optional caption (sent with the first file), then send. Full screen on
// phones, a centered card from `sm` up.
export function FilePreviewDialog({
  files,
  onChange,
  onSend,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onSend: (caption: string | null) => void;
}) {
  const [caption, setCaption] = useState("");
  const open = files.length > 0;
  const total = files.reduce((sum, file) => sum + file.size, 0);

  function close() {
    onChange([]);
    setCaption("");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 start-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 rtl:translate-x-0 sm:inset-auto sm:top-1/2 sm:start-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:rtl:translate-x-1/2"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 sm:pt-3">
          <Button type="button" variant="ghost" size="icon-lg" onClick={close} aria-label="Cancel" className="size-11 rounded-full">
            <X className="size-6" />
          </Button>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">{formatCount(files.length, "file")} selected</DialogTitle>
            <DialogDescription className="text-xs">{formatBytes(total)} · sent as is, without compression</DialogDescription>
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain px-3">
          {files.map((file, index) => {
            const { icon: Icon, className: tone } = FILE_KIND_STYLE[fileKind(file.type, file.name)];
            return (
              <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="flex items-center gap-3 py-2">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tone)}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" title={file.name} className="truncate text-sm font-medium">
                    {shortFileName(file.name, 36)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                  className="size-11 shrink-0 rounded-full text-muted-foreground"
                >
                  <X className="size-5" />
                </Button>
              </li>
            );
          })}
        </ul>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSend(caption.trim() || null);
            setCaption("");
          }}
          className="flex shrink-0 items-end gap-2 border-t px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-3"
        >
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={MAX_CAPTION_LENGTH}
            dir="auto"
            placeholder="Add a caption (optional)"
            aria-label="Caption"
            className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="lg" className="h-11 shrink-0 gap-2 rounded-full px-4 text-base">
            Send
            <SendHorizontal className="size-5 rtl:-scale-x-100" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

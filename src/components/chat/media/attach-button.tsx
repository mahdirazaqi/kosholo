"use client";

import { useRef, useState } from "react";
import { Camera, Images, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { MediaPreviewDialog } from "@/components/chat/media/media-preview-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { prepareFile, type PreparedFile } from "@/lib/media/client/prepare";
import { MAX_FILES_PER_SELECTION, MEDIA_ERRORS } from "@/lib/media/limits";

// Paperclip → «عکس و ویدیو» (gallery, multiple) or «دوربین» (capture), then a
// full-screen preview with a caption before sending.
export function AttachButton({ onSend }: { onSend: (files: PreparedFile[], caption: string | null) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [selection, setSelection] = useState<PreparedFile[]>([]);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function onFiles(list: FileList | null) {
    setSheetOpen(false);
    if (!list || list.length === 0) return;
    let files = Array.from(list);
    if (files.length > MAX_FILES_PER_SELECTION) {
      toast.error(MEDIA_ERRORS.tooMany);
      files = files.slice(0, MAX_FILES_PER_SELECTION);
    }
    setPreparing(true);
    const prepared: PreparedFile[] = [];
    for (const file of files) {
      try {
        prepared.push(await prepareFile(file));
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : MEDIA_ERRORS.unsupported}`);
      }
    }
    setPreparing(false);
    if (prepared.length) setSelection(prepared);
  }

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="پیوست"
            disabled={preparing}
            className="size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            {preparing ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
          </Button>
        </SheetTrigger>
        <BottomSheetContent>
          <SheetHeader className="pt-3">
            <SheetTitle className="text-lg font-bold">ارسال فایل</SheetTitle>
            <SheetDescription className="sr-only">انتخاب عکس یا ویدیو</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <Option icon={<Images />} label="عکس و ویدیو" onClick={() => galleryRef.current?.click()} />
            <Option icon={<Camera />} label="دوربین" onClick={() => cameraRef.current?.click()} />
          </div>
        </BottomSheetContent>
      </Sheet>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <MediaPreviewDialog
        files={selection}
        onChange={setSelection}
        onSend={(caption) => {
          onSend(selection, caption);
          setSelection([]);
        }}
      />
    </>
  );
}

function Option({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center gap-3 rounded-2xl px-3 text-start text-base transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      {label}
    </button>
  );
}

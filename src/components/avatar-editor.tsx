"use client";

import { useRef, useState } from "react";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { UserAvatar } from "@/components/user-avatar";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { prepareFile } from "@/lib/media/client/prepare";
import { uploadFile } from "@/lib/media/client/upload";
import { MEDIA_ERRORS, UPLOAD_LIMITS } from "@/lib/media/limits";
import { setAvatarOverride, useRealtimeStore } from "@/lib/realtime/client/store";
import { formatNumber } from "@/lib/numbers";

type SaveResult = { ok: true; avatarUrl: string | null } | { ok: false; error: string };

// Big avatar that opens "Change photo" / "Remove photo". The image is downscaled in
// the browser, uploaded as AVATAR (server crops 512×512 + 128 thumb), then
// saved with `onSave(uploadId | null)`. The change shows here immediately and
// reaches everyone else through user:updated / conversation:updated.
export function AvatarEditor({
  entity,
  onSave,
  label,
}: {
  entity: { id: string; name: string; avatarUrl: string | null };
  onSave: (uploadId: string | null) => Promise<SaveResult>;
  label: string; // e.g. "profile photo"
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const override = useRealtimeStore((state) => state.avatars[entity.id]);
  const hasPhoto = Boolean(override !== undefined ? override : entity.avatarUrl);

  async function save(uploadId: string | null) {
    const result = await onSave(uploadId);
    if (!result.ok) return void toast.error(result.error);
    setAvatarOverride(entity.id, result.avatarUrl);
    toast.success(uploadId ? "Photo updated" : "Photo removed");
  }

  async function onFile(file: File | undefined) {
    setOpen(false);
    if (!file) return;
    try {
      const prepared = await prepareFile(file);
      URL.revokeObjectURL(prepared.previewUrl);
      if (prepared.kind !== "IMAGE") throw new Error(MEDIA_ERRORS.unsupported);
      if (prepared.file.size > UPLOAD_LIMITS.AVATAR) throw new Error(MEDIA_ERRORS.tooLarge("AVATAR"));
      setProgress(0);
      const media = await uploadFile(prepared.file, "AVATAR", { onProgress: setProgress });
      await save(media.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the photo");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={progress !== null}
        aria-label={`Change ${label}`}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar user={entity} size="2xl" />
        <span className="absolute end-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
          <Camera className="size-4" />
        </span>
        {progress !== null && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-viewer/45 text-sm font-semibold text-overlay-foreground">
            {formatNumber(Math.round(progress * 100))}%
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent>
          <SheetHeader className="pt-3">
            <SheetTitle className="text-lg font-bold">{label}</SheetTitle>
            <SheetDescription className="sr-only">Change or remove the photo</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors hover:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground"
            >
              <ImageUp />
              Change photo
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void save(null);
                }}
                className="flex h-12 items-center gap-3 rounded-xl px-3 text-base text-destructive transition-colors hover:bg-destructive/10 [&_svg]:size-5"
              >
                <Trash2 />
                Remove photo
              </button>
            )}
          </div>
        </BottomSheetContent>
      </Sheet>
    </>
  );
}

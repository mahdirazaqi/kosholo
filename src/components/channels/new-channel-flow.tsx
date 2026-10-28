"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, Loader2, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { createChannel } from "@/app/(app)/chats/channel-actions";
import { BackButton } from "@/components/back-button";
import { MemberPicker } from "@/components/groups/member-picker";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prepareFile } from "@/lib/media/client/prepare";
import { uploadFile } from "@/lib/media/client/upload";
import { MEDIA_ERRORS, UPLOAD_LIMITS } from "@/lib/media/limits";
import { formatNumber } from "@/lib/numbers";
import type { PublicUser } from "@/lib/users";
import {
  channelDescriptionSchema,
  channelTitleSchema,
  MAX_CHANNEL_ADD_PER_REQUEST,
  MAX_CHANNEL_DESCRIPTION,
} from "@/lib/validations/channels";

// Two steps: 1) photo, name and description, 2) subscribers from my contacts
// (optional). The channel is created at the end; the photo is uploaded as soon
// as it is picked.
export function NewChannelFlow({ contacts }: { contacts: PublicUser[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [photo, setPhoto] = useState<{ uploadId: string; previewUrl: string } | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const prepared = await prepareFile(file);
      if (prepared.kind !== "IMAGE") {
        URL.revokeObjectURL(prepared.previewUrl);
        throw new Error(MEDIA_ERRORS.unsupported);
      }
      if (prepared.file.size > UPLOAD_LIMITS.AVATAR) {
        URL.revokeObjectURL(prepared.previewUrl);
        throw new Error(MEDIA_ERRORS.tooLarge("AVATAR"));
      }
      setPhotoProgress(0);
      const media = await uploadFile(prepared.file, "AVATAR", { onProgress: setPhotoProgress });
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = prepared.previewUrl;
      setPhoto({ uploadId: media.id, previewUrl: prepared.previewUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload the photo");
    } finally {
      setPhotoProgress(null);
    }
  }

  function next(event: React.FormEvent) {
    event.preventDefault();
    const parsedTitle = channelTitleSchema.safeParse(title);
    if (!parsedTitle.success) return setError(parsedTitle.error.issues[0].message);
    const parsedDescription = channelDescriptionSchema.safeParse(description);
    if (!parsedDescription.success) return setError(parsedDescription.error.issues[0].message);
    setError(undefined);
    setStep(2);
  }

  function create(memberIds: string[]) {
    startTransition(async () => {
      const result = await createChannel({
        title,
        description: description || null,
        avatarUploadId: photo?.uploadId ?? null,
        memberIds,
      });
      if (result.ok) router.replace(`/chats/${result.conversationId}`);
      else toast.error(result.error);
    });
  }

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        start={
          step === 1 ? (
            <BackButton />
          ) : (
            <Button variant="ghost" size="icon-lg" aria-label="Back" className="-ms-2 rounded-full" onClick={() => setStep(1)}>
              <ChevronLeft className="size-6 rtl:rotate-180" />
            </Button>
          )
        }
        title="New channel"
        subtitle={step === 1 ? "Channel details" : `Add subscribers · ${formatNumber(selected.length)} selected`}
      />

      {step === 1 ? (
        <form onSubmit={next} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-8">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={photoProgress !== null}
                aria-label="Choose a channel photo"
                className="relative flex size-24 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Megaphone className="size-10" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-black/40 text-white">
                  {photoProgress !== null ? (
                    <span className="text-xs font-semibold">{formatNumber(Math.round(photoProgress * 100))}%</span>
                  ) : (
                    <Camera className="size-4" />
                  )}
                </span>
              </button>
              {photo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)} className="rounded-full text-muted-foreground">
                  <X />
                  Remove photo
                </Button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(event) => {
                  void onPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-title">Channel name</Label>
              <Input
                id="channel-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={50}
                autoFocus
                aria-invalid={error ? true : undefined}
                placeholder="e.g. Product news"
                className="h-11"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-description">Description (optional)</Label>
              <Textarea
                id="channel-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={MAX_CHANNEL_DESCRIPTION}
                rows={3}
                dir="auto"
              />
              <p className="text-end text-xs text-muted-foreground">
                {formatNumber(description.length)}/{formatNumber(MAX_CHANNEL_DESCRIPTION)}
              </p>
            </div>
          </div>
          <div className="shrink-0 border-t bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button type="submit" size="lg" disabled={!title.trim() || photoProgress !== null} className="h-12 w-full rounded-xl text-base">
              Next
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <MemberPicker contacts={contacts} selected={selected} onToggle={toggle} max={MAX_CHANNEL_ADD_PER_REQUEST} />
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button variant="outline" size="lg" disabled={pending} onClick={() => create([])} className="h-12 rounded-xl text-base">
              Skip
            </Button>
            <Button size="lg" disabled={pending || selected.length === 0} onClick={() => create(selected)} className="h-12 rounded-xl text-base">
              {pending && <Loader2 className="animate-spin" />}
              Create channel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

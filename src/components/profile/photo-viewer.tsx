"use client";

import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { Download, EllipsisVertical, Star, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useBackLayer } from "@/hooks/use-back-layer";
import { formatAge } from "@/lib/format-date";
import { formatNumber } from "@/lib/numbers";
import type { ProfilePhotoItem } from "@/lib/types/profile";

// Full-screen gallery: swipe between photos (direction follows the page's
// writing direction), pinch / double-tap zoom, pull down to close, Android back
// closes it first (back stack). Everyone can download; the owner can also make a
// photo the main one or delete it. The lightbox root is a recognised zoom zone.
export function ProfilePhotoViewer({
  photos,
  startIndex,
  onClose,
  owner,
}: {
  photos: ProfilePhotoItem[];
  startIndex: number;
  onClose: () => void;
  owner?: { onSetMain: (photo: ProfilePhotoItem) => void; onDelete: (photo: ProfilePhotoItem) => void };
}) {
  useBackLayer(true, onClose);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  // In RTL the slides run the other way, so swiping towards the inline end still means "next".
  const ordered = useMemo(() => (rtl ? [...photos].reverse() : photos), [photos, rtl]);
  const toLightbox = (i: number) => (rtl ? photos.length - 1 - i : i);
  const [index, setIndex] = useState(Math.min(startIndex, photos.length - 1));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = photos[Math.min(index, photos.length - 1)];
  if (!current) return null;

  return (
    <>
      <Lightbox
        open
        close={onClose}
        index={toLightbox(Math.min(index, photos.length - 1))}
        slides={ordered.map((photo) => ({ src: photo.fullUrl, width: 1280, height: 1280, alt: "Profile photo" }))}
        on={{ view: ({ index: next }) => setIndex(rtl ? photos.length - 1 - next : next) }}
        plugins={[Zoom]}
        carousel={{ finite: true, preload: 1 }}
        controller={{ closeOnPullDown: true, closeOnBackdropClick: false }}
        zoom={{ maxZoomPixelRatio: 3, doubleTapDelay: 300 }}
        // Below the dialogs and menus (z-50) so the delete confirmation shows on top.
        styles={{ root: { zIndex: 40 } }}
        toolbar={{ buttons: [] }}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
          controls: () => (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-viewer/60 to-transparent px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-6 text-overlay-foreground">
              <Button type="button" variant="ghost" size="icon-lg" aria-label="Close" onClick={onClose} className="size-11 rounded-full text-overlay-foreground hover:bg-overlay-foreground/15">
                <X className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <p aria-live="polite" className="text-sm font-semibold">
                  {formatNumber(index + 1)} of {formatNumber(photos.length)}
                </p>
                <p suppressHydrationWarning className="truncate text-xs text-overlay-foreground/75">
                  {formatAge(current.createdAt)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label="Photo options" className="size-11 rounded-full text-overlay-foreground hover:bg-overlay-foreground/15">
                    <EllipsisVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem asChild>
                    <a href={current.fullUrl} download="profile-photo.webp">
                      <Download />
                      Download
                    </a>
                  </DropdownMenuItem>
                  {owner && !current.isMain && (
                    <DropdownMenuItem onSelect={() => owner.onSetMain(current)}>
                      <Star />
                      Set as main photo
                    </DropdownMenuItem>
                  )}
                  {owner && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        }}
      />
      {owner && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete photo?"
          description="This photo will be deleted forever."
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            owner.onDelete(current);
          }}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const MAX_WIDTH_REM = 18; // ~70% of a phone-width chat
const MAX_HEIGHT_REM = 22;

// Fixed aspect-ratio box for image/video bubbles (no layout shift), with the
// blurred placeholder underneath until the real image loads.
export function MediaFrame({
  width,
  height,
  placeholder,
  src,
  alt,
  className,
  children,
}: {
  width: number | null;
  height: number | null;
  placeholder: string | null;
  src: string | null;
  alt: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ratio = width && height ? width / height : 4 / 3;
  // Wide images are capped by width, tall ones by height.
  const widthCss = `min(${MAX_WIDTH_REM}rem, ${(MAX_HEIGHT_REM * ratio).toFixed(3)}rem, 100%)`;

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl bg-muted", className)}
      style={{ aspectRatio: String(ratio), width: widthCss, minWidth: "8rem" }}
    >
      {placeholder && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img draggable={false} src={placeholder} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-lg" />
      )}
      {src && !failed && (
        // Authenticated, already-sized images: next/image would only add a proxy hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Server-rendered images can finish loading before hydration, when
          // onLoad isn't attached yet: check on mount too.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {children}
    </div>
  );
}

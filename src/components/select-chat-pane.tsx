import { Wallpaper } from "@/lib/appearance/wallpapers";

// Desktop main pane when no chat is open.
export function SelectChatPane() {
  return (
    <div className="relative hidden h-full flex-col items-center justify-center gap-4 px-8 text-center lg:flex">
      <Wallpaper />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img draggable={false} src="/logo.svg" alt="" width={88} height={88} className="relative rounded-3xl opacity-90" />
      <p className="relative rounded-full bg-service-pill px-4 py-1.5 text-base font-medium text-service-pill-foreground ring-1 ring-foreground/5">Select a chat to start messaging</p>
    </div>
  );
}

// Desktop main pane when no chat is open.
export function SelectChatPane() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-4 bg-muted/30 px-8 text-center lg:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={88} height={88} className="rounded-3xl opacity-90" />
      <p className="text-base font-medium text-muted-foreground">یک گفتگو را برای شروع انتخاب کنید</p>
    </div>
  );
}

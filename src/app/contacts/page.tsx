import { Users } from "lucide-react";

export default function Page() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Users className="size-7" strokeWidth={1.75} />
      </div>
      <h1 className="text-xl font-bold">مخاطبین</h1>
      <p className="text-sm text-muted-foreground">به‌زودی…</p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createGroup } from "@/app/(app)/chats/group-actions";
import { BackButton } from "@/components/back-button";
import { MemberPicker } from "@/components/groups/member-picker";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicUser } from "@/lib/users";
import { groupTitleSchema, MAX_GROUP_MEMBERS } from "@/lib/validations/groups";
import { formatCount, formatNumber } from "@/lib/numbers";

// Two steps: 1) pick members, 2) name the group.
export function NewGroupFlow({ contacts }: { contacts: PublicUser[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  function create(event: React.FormEvent) {
    event.preventDefault();
    const parsed = groupTitleSchema.safeParse(title);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(undefined);
    startTransition(async () => {
      const result = await createGroup({ title: parsed.data, memberIds: selected });
      if (result.ok) router.replace(`/chats/${result.conversationId}`);
      else toast.error(result.error);
    });
  }

  const count = formatCount(selected.length + 1, "member");

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
        title="New group"
        subtitle={step === 1 ? `Add members · ${formatNumber(selected.length)} selected` : "Group name"}
      />

      {step === 1 ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <MemberPicker contacts={contacts} selected={selected} onToggle={toggle} max={MAX_GROUP_MEMBERS - 1} />
          </div>
          <div className="shrink-0 border-t bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button size="lg" disabled={selected.length === 0} onClick={() => setStep(2)} className="h-12 w-full rounded-xl text-base">
              Next
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={create} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-8">
            <div className="flex flex-col items-center gap-3">
              <UserAvatar user={{ id: "new-group", name: title.trim() || "Group", avatarUrl: null }} size="2xl" />
              <p className="text-sm text-muted-foreground">{count}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-title">Group name</Label>
              <Input
                id="group-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={50}
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "group-title-error" : undefined}
                placeholder="e.g. Family"
                className="h-11"
              />
              {error && (
                <p id="group-title-error" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button type="submit" size="lg" disabled={pending || !title.trim()} className="h-12 w-full rounded-xl text-base">
              {pending && <Loader2 className="animate-spin" />}
              Create group
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

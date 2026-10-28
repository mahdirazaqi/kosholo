"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MessageCircle, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  addContact,
  findUser,
  startDirectConversation,
  type LookupResult,
} from "@/app/(app)/(tabs)/contacts/actions";
import { BottomSheetContent } from "@/components/bottom-sheet";
import { fieldA11y } from "@/components/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { userLookupSchema } from "@/lib/validations/contacts";

type FoundUser = Extract<LookupResult, { ok: true }>["user"];

export function AddContactSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <AddContactForm />
      </BottomSheetContent>
    </Sheet>
  );
}

function AddContactForm() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [found, setFound] = useState<FoundUser | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  const [messaging, startMessage] = useTransition();

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = userLookupSchema.safeParse(query);
    if (!parsed.success) {
      setFound(null);
      setError(parsed.error.issues[0].message);
      return;
    }
    startSearch(async () => {
      const result = await findUser(query);
      setFound(result.ok ? result.user : null);
      setError(result.ok ? undefined : result.error);
    });
  }

  function add(user: FoundUser) {
    startAdd(async () => {
      const result = await addContact(user.id);
      if (result.ok) {
        setFound({ ...user, isContact: true });
        toast.success(`${user.name} added to contacts`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function message(user: FoundUser) {
    startMessage(async () => {
      const result = await startDirectConversation(user.id);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <>
      <SheetHeader className="pt-3">
        <SheetTitle className="text-lg font-bold">Add contact</SheetTitle>
        <SheetDescription>Enter the person&apos;s exact username or email.</SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <form onSubmit={search} noValidate className="space-y-2">
          <Label htmlFor="lookup">Username or email</Label>
          <div className="flex gap-2">
            <Input
              {...fieldA11y("lookup", error)}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              dir="ltr"
              placeholder="@username or email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 flex-1 text-start"
            />
            <Button
              type="submit"
              size="lg"
              disabled={searching}
              aria-label="Search"
              className="h-11 rounded-xl px-4 text-base"
            >
              {searching ? <Loader2 className="animate-spin" /> : <Search />}
              Search
            </Button>
          </div>
          {error && (
            <p id="lookup-error" className="text-xs leading-5 text-destructive">
              {error}
            </p>
          )}
        </form>

        {found && (
          <div className="space-y-4 rounded-2xl border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <UserAvatar user={found} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{found.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  <bdi dir="ltr">@{found.username}</bdi>
                </p>
              </div>
            </div>

            {found.isSelf ? (
              <p className="text-sm text-destructive">You can&apos;t add yourself</p>
            ) : (
              <div className="grid gap-2">
                {found.isContact ? (
                  <Button size="lg" variant="secondary" disabled className="h-11 rounded-xl text-base">
                    <Check />
                    Already in your contacts
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={() => add(found)}
                    disabled={adding}
                    className="h-11 rounded-xl text-base"
                  >
                    {adding ? <Loader2 className="animate-spin" /> : <UserPlus />}
                    Add to contacts
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => message(found)}
                  disabled={messaging}
                  className="h-11 rounded-xl text-base"
                >
                  {messaging ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                  Send message
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

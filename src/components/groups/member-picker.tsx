"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { firstName } from "@/lib/chat/system-text";
import type { PublicUser } from "@/lib/users";
import { cn } from "@/lib/utils";

// Contacts with checkboxes, a local filter and removable chips for the
// selection. Used by the new-group flow and "Add members".
export function MemberPicker({
  contacts,
  selected,
  onToggle,
  max,
}: {
  contacts: PublicUser[];
  selected: string[];
  onToggle: (userId: string) => void;
  max?: number;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase().replace(/^@/, "");
  const visible = useMemo(
    () =>
      query
        ? contacts.filter((c) => c.name.toLowerCase().includes(query) || c.username.includes(query))
        : contacts,
    [contacts, query],
  );
  const selectedUsers = selected
    .map((id) => contacts.find((contact) => contact.id === id))
    .filter((user): user is PublicUser => Boolean(user));
  const full = max !== undefined && selected.length >= max;

  return (
    <div className="space-y-3">
      {selectedUsers.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected">
          {selectedUsers.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onToggle(user.id)}
                aria-label={`Remove ${user.name}`}
                className="flex h-9 animate-in items-center gap-1.5 rounded-full bg-primary/10 ps-1 pe-2.5 text-sm font-medium text-link zoom-in-95 duration-150 hover:bg-primary/15"
              >
                <UserAvatar user={user} size="xs" />
                {firstName(user.name)}
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4.5 text-muted-foreground" />
        <Input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search contacts"
          aria-label="Search contacts"
          className="h-11 rounded-xl bg-muted/50 ps-10"
        />
      </div>

      {contacts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No contacts to add</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No matching contacts</p>
      ) : (
        <ul className="-mx-2">
          {visible.map((contact) => {
            const checked = selected.includes(contact.id);
            const disabled = !checked && full;
            return (
              <li key={contact.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => onToggle(contact.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted disabled:opacity-50"
                >
                  <UserAvatar user={contact} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{contact.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      <bdi dir="ltr">@{contact.username}</bdi>
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

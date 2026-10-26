"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { AddContactSheet } from "@/components/contacts/add-contact-sheet";
import { EmptyState } from "@/components/empty-state";
import { ContactSheet } from "@/components/contacts/contact-sheet";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicUser } from "@/lib/users";
import { toFaDigits } from "@/lib/digits";

export function ContactsView({ contacts }: { contacts: PublicUser[] }) {
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Bumped on every open so the add sheet starts with a fresh search.
  const [addKey, setAddKey] = useState(0);

  function openAdd() {
    setAddKey((key) => key + 1);
    setAddOpen(true);
  }

  const filtered = useMemo(() => {
    const query = normalize(filter).replace(/^@/, "");
    if (!query) return contacts;
    return contacts.filter(
      (contact) => normalize(contact.name).includes(query) || contact.username.includes(query),
    );
  }, [contacts, filter]);

  // Looked up by id so the sheet closes by itself once the contact is removed.
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="مخاطبین"
        subtitle={
          contacts.length > 0 ? `${toFaDigits(contacts.length)} مخاطب` : undefined
        }
      />

      {contacts.length === 0 ? (
        <ContactsEmpty onAdd={openAdd} />
      ) : (
        <div className="px-4 pt-4 pb-28">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4.5 text-muted-foreground" />
            <Input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="جستجو در مخاطبین"
              aria-label="جستجو در مخاطبین"
              className="h-11 rounded-xl bg-muted/50 ps-10"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              مخاطبی با این مشخصات پیدا نشد
            </p>
          ) : (
            <ul className="-mx-2">
              {filtered.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(contact.id);
                      setContactOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none active:bg-muted"
                  >
                    <UserAvatar user={contact} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{contact.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        <bdi dir="ltr">@{contact.username}</bdi>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button
        size="icon-lg"
        onClick={openAdd}
        aria-label="افزودن مخاطب"
        className="absolute end-[calc(1rem+max(env(safe-area-inset-left),env(safe-area-inset-right)))] bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:bottom-6 z-30 size-14 rounded-2xl shadow-lg shadow-primary/20"
      >
        <UserPlus className="size-6" />
      </Button>

      <ContactSheet
        contact={selected}
        open={contactOpen && selected !== null}
        onOpenChange={setContactOpen}
      />
      <AddContactSheet key={addKey} open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function ContactsEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon={<Users />}
      title="هنوز مخاطبی ندارید"
      description="دوستانتان را با نام کاربری یا ایمیل پیدا کنید و به فهرست خود اضافه کنید."
      className="min-h-[calc(100%-3.5rem)]"
      action={
        <Button size="lg" onClick={onAdd} className="h-11 rounded-xl px-5 text-base">
          <UserPlus />
          افزودن اولین مخاطب
        </Button>
      }
    />
  );
}

// Lowercase and unify Arabic/Persian variants of ی and ک for matching.
function normalize(value: string) {
  return value.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
}

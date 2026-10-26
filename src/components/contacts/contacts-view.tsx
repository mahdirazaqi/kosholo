"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { AddContactSheet } from "@/components/contacts/add-contact-sheet";
import { ContactSheet } from "@/components/contacts/contact-sheet";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicUser } from "@/lib/users";

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
          contacts.length > 0 ? `${contacts.length.toLocaleString("fa-IR")} مخاطب` : undefined
        }
      />

      {contacts.length === 0 ? (
        <EmptyState onAdd={openAdd} />
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
        className="absolute end-[calc(1rem+max(env(safe-area-inset-left),env(safe-area-inset-right)))] bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 size-14 rounded-2xl shadow-lg shadow-primary/20"
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex min-h-[calc(100%-3.5rem)] flex-col items-center justify-center gap-5 px-8 py-16 text-center">
      <div className="relative">
        <div className="flex size-24 items-center justify-center rounded-[2rem] bg-muted">
          <Users className="size-11 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="absolute -end-2 -bottom-2 flex size-10 items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground">
          <UserPlus className="size-4.5" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold">هنوز مخاطبی ندارید</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          دوستانتان را با نام کاربری یا ایمیل پیدا کنید و به فهرست خود اضافه کنید.
        </p>
      </div>
      <Button size="lg" onClick={onAdd} className="h-11 rounded-xl px-5 text-base">
        <UserPlus />
        افزودن اولین مخاطب
      </Button>
    </div>
  );
}

// Lowercase and unify Arabic/Persian variants of ی and ک for matching.
function normalize(value: string) {
  return value.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
}

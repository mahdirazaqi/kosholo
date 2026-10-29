"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { IconTile } from "@/components/settings/icon-tile";
import { SettingsSection } from "@/components/settings/settings-section";
import { queueHighlight } from "@/lib/settings/highlight";
import { searchSettings } from "@/lib/settings/search-index";

// The field under the header. Typing swaps the sections for the results (see
// SettingsSearchResults); the page owns the query so it can hide its sections.
export function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative mb-6">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        aria-label="Search settings"
        className="h-11 w-full rounded-xl bg-grouped-cell ps-10 pe-10 text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute end-0 top-0 flex size-11 items-center justify-center text-muted-foreground"
        >
          <X className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

export function SettingsSearchResults({ query }: { query: string }) {
  const router = useRouter();
  const results = searchSettings(query);

  if (results.length === 0) {
    return <p className="py-16 text-center text-base text-muted-foreground">No results found</p>;
  }
  return (
    <SettingsSection>
      {results.map((entry) => (
        <li key={entry.id} style={{ "--sep-inset": "3.625rem" } as React.CSSProperties} className="row-sep relative">
          <button
            type="button"
            onClick={() => {
              queueHighlight(entry.id);
              router.push(entry.href);
            }}
            className="row-press no-press flex min-h-12 w-full items-center gap-3 ps-4 pe-4 text-start"
          >
            <IconTile icon={entry.icon} color={entry.tile} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px]">{entry.title}</span>
              {entry.path.length > 0 && (
                <span className="block truncate text-[13px] text-muted-foreground">{entry.path.join(" › ")}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </SettingsSection>
  );
}

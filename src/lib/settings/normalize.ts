// Search text normalisation: lowercase, Persian/Arabic letters unified
// (ی/ي/ى → ی, ک/ك → ک), Persian and Arabic digits → Western, diacritics and
// half-spaces (ZWNJ) and extra spaces removed.
export function normalizeSearch(input: string) {
  return input
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[‌​‍]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Spaces are ignored too, so "پیام های" matches "پیام‌های".
export const squash = (input: string) => normalizeSearch(input).replace(/ /g, "");

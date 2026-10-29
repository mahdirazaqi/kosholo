"use client";

// Tapping a search result navigates to the page and flashes the row: the id
// travels through sessionStorage (no search params, so the pages stay static).
const KEY = "kosholo:setting-highlight";

export function queueHighlight(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
}

export function takeHighlight() {
  try {
    const id = sessionStorage.getItem(KEY);
    if (id) sessionStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}

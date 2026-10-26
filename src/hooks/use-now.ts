"use client";

import { useEffect, useState } from "react";

// Current time, refreshed every `intervalMs` (for relative times like "5 دقیقه پیش").
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

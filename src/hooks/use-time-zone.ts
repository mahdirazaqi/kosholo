"use client";

import { useSyncExternalStore } from "react";
import { SERVER_TIME_ZONE } from "@/lib/format-date";

const subscribe = () => () => {};
const getBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_TIME_ZONE;
const getServerTimeZone = () => SERVER_TIME_ZONE;

// The viewer's time zone for date formatting. The server render and hydration
// use UTC (so they agree), then React re-renders with the browser's zone.
export function useTimeZone() {
  return useSyncExternalStore(subscribe, getBrowserTimeZone, getServerTimeZone);
}

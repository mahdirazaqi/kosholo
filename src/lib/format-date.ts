// Dates are formatted in the viewer's time zone (`useTimeZone()`). The server
// render and hydration use UTC, then the client re-renders with its own zone.
export const SERVER_TIME_ZONE = "UTC";

const LOCALE = "en-US";

type Formats = ReturnType<typeof createFormats>;
const formatsByZone = new Map<string, Formats>();

function createFormats(timeZone: string) {
  return {
    time: new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "numeric", minute: "2-digit" }),
    weekday: new Intl.DateTimeFormat(LOCALE, { timeZone, weekday: "long" }),
    shortDate: new Intl.DateTimeFormat(LOCALE, { timeZone, year: "numeric", month: "short", day: "numeric" }),
    longDate: new Intl.DateTimeFormat(LOCALE, { timeZone, month: "long", day: "numeric" }),
    longDateWithYear: new Intl.DateTimeFormat(LOCALE, { timeZone, month: "long", day: "numeric", year: "numeric" }),
    parts: new Intl.DateTimeFormat(LOCALE, { timeZone, year: "numeric", month: "numeric", day: "numeric" }),
  };
}

function formats(timeZone: string) {
  let entry = formatsByZone.get(timeZone);
  if (!entry) {
    try {
      entry = createFormats(timeZone);
    } catch {
      // Unknown zone name: fall back to UTC rather than crash the render.
      entry = createFormats(SERVER_TIME_ZONE);
    }
    formatsByZone.set(timeZone, entry);
  }
  return entry;
}

type DateInput = Date | string;
const toDate = (value: DateInput) => (typeof value === "string" ? new Date(value) : value);

// Calendar day number in `timeZone`, for "same day" / "yesterday" comparisons.
export function dayNumber(value: DateInput, timeZone = SERVER_TIME_ZONE) {
  const parts = Object.fromEntries(
    formats(timeZone).parts.formatToParts(toDate(value)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
}

export function isSameDay(a: DateInput, b: DateInput, timeZone = SERVER_TIME_ZONE) {
  return dayNumber(a, timeZone) === dayNumber(b, timeZone);
}

// "2:05 PM"
export function formatTime(value: DateInput, timeZone = SERVER_TIME_ZONE) {
  return formats(timeZone).time.format(toDate(value));
}

// Chat list: today → time, yesterday → "Yesterday", this week → weekday, older → date.
export function formatListTime(value: DateInput, timeZone = SERVER_TIME_ZONE, now: Date = new Date()) {
  const date = toDate(value);
  const diff = dayNumber(now, timeZone) - dayNumber(date, timeZone);
  if (diff <= 0) return formatTime(date, timeZone);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return formats(timeZone).weekday.format(date);
  return formats(timeZone).shortDate.format(date);
}

// Day separators in a conversation: "Today", "Yesterday", otherwise "October 26"
// (with the year if different).
export function formatDaySeparator(value: DateInput, timeZone = SERVER_TIME_ZONE, now: Date = new Date()) {
  const date = toDate(value);
  const diff = dayNumber(now, timeZone) - dayNumber(date, timeZone);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const year = (d: Date) => formats(timeZone).parts.formatToParts(d).find((part) => part.type === "year")?.value;
  const f = formats(timeZone);
  return (year(date) === year(now) ? f.longDate : f.longDateWithYear).format(date);
}

const MINUTE = 60_000;

// "Last seen" phrase: "just now", "5 minutes ago", "today at 2:05 PM",
// "yesterday at 11:10 PM", otherwise the date.
export function formatLastSeen(value: DateInput, timeZone = SERVER_TIME_ZONE, now: Date = new Date()) {
  const date = toDate(value);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < 60 * MINUTE) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const diff = dayNumber(now, timeZone) - dayNumber(date, timeZone);
  if (diff === 0) return `today at ${formatTime(date, timeZone)}`;
  if (diff === 1) return `yesterday at ${formatTime(date, timeZone)}`;
  return formats(timeZone).shortDate.format(date);
}

// "October 26, 2026"
export function formatFullDate(value: DateInput, timeZone = SERVER_TIME_ZONE) {
  return formats(timeZone).longDateWithYear.format(toDate(value));
}

// Media length: "1:05" (m:ss), "1:02:05" past an hour.
export function formatDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// All chat dates are shown in one fixed time zone so server rendering and
// hydration agree (the server runs in UTC). The audience is in Iran.
export const TIME_ZONE = "Asia/Tehran";

const LOCALE = "fa-IR-u-ca-persian-nu-arabext";

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "long" });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const longDateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
});
const longDateWithYearFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const yearFormat = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: TIME_ZONE, year: "numeric" });
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

type DateInput = Date | string;
const toDate = (value: DateInput) => (typeof value === "string" ? new Date(value) : value);

// Calendar day number in TIME_ZONE, for "same day" / "yesterday" comparisons.
export function dayNumber(value: DateInput) {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(toDate(value)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
}

export function isSameDay(a: DateInput, b: DateInput) {
  return dayNumber(a) === dayNumber(b);
}

// "۱۴:۰۵"
export function formatTime(value: DateInput) {
  return timeFormat.format(toDate(value));
}

// Chat list: today → time, yesterday → «دیروز», this week → weekday, older → Jalali date.
export function formatListTime(value: DateInput, now: Date = new Date()) {
  const date = toDate(value);
  const diff = dayNumber(now) - dayNumber(date);
  if (diff <= 0) return formatTime(date);
  if (diff === 1) return "دیروز";
  if (diff < 7) return weekdayFormat.format(date);
  return shortDateFormat.format(date);
}

// Day separators in a conversation: «امروز», «دیروز», otherwise "۴ آبان" (with the year if different).
export function formatDaySeparator(value: DateInput, now: Date = new Date()) {
  const date = toDate(value);
  const diff = dayNumber(now) - dayNumber(date);
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  const sameYear = yearFormat.format(date) === yearFormat.format(now);
  return (sameYear ? longDateFormat : longDateWithYearFormat).format(date);
}

const MINUTE = 60_000;

// "Last seen" phrase: «لحظاتی پیش», «۵ دقیقه پیش», «امروز ساعت ۱۴:۰۵»,
// «دیروز ساعت ۲۳:۱۰», otherwise the Jalali date.
export function formatLastSeen(value: DateInput, now: Date = new Date()) {
  const date = toDate(value);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "لحظاتی پیش";
  if (elapsed < 60 * MINUTE) {
    return `${Math.floor(elapsed / MINUTE).toLocaleString("fa-IR")} دقیقه پیش`;
  }
  const diff = dayNumber(now) - dayNumber(date);
  if (diff === 0) return `امروز ساعت ${formatTime(date)}`;
  if (diff === 1) return `دیروز ساعت ${formatTime(date)}`;
  return shortDateFormat.format(date);
}

// "۴ آبان ۱۴۰۵"
export function formatFullDate(value: DateInput) {
  return longDateWithYearFormat.format(toDate(value));
}

// Media length: "۱:۰۵" (m:ss), "۱:۰۲:۰۵" past an hour.
export function formatDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  const text = h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  return text.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

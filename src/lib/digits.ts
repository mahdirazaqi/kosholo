// The one place that turns numbers into Persian digits. Use it for every
// count, badge, time, duration and size shown in the UI.
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

// Numbers get Persian digits and separators ("۱٬۲۳۴", "۱٫۵"); strings get
// their ASCII digits replaced ("12:05" → "۱۲:۰۵").
export function toFaDigits(value: number | string): string {
  if (typeof value === "number") return value.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
  return value.replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

// "۲٫۴ مگابایت"
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${toFaDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toFaDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${toFaDigits(Math.round((bytes / (1024 * 1024)) * 10) / 10)} مگابایت`;
}

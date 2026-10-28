// The one place that formats numbers for the UI. Use it for every count,
// badge, size and percentage shown, so grouping stays consistent ("1,234", "1.5").
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

// "1 member", "3 members". `plural` defaults to `singular + "s"`.
export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

// "850 KB", "2.4 MB", "1.4 GB"
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${formatNumber(Math.round((bytes / 1024 ** 2) * 10) / 10)} MB`;
  return `${formatNumber(Math.round((bytes / 1024 ** 3) * 10) / 10)} GB`;
}

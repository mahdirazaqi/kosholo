// Client-safe waveform helpers.

// Resamples stored values (any length: old messages have 48, new ones 64) to
// `count` bars: averages the values that fall into a bar when shrinking,
// interpolates linearly when growing.
export function resampleWaveform(values: number[], count: number): number[] {
  if (count <= 0) return [];
  if (values.length === 0) return Array<number>(count).fill(0);
  if (values.length === count) return values;
  const out: number[] = new Array(count);
  if (values.length > count) {
    const ratio = values.length / count;
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += values[j];
      out[i] = sum / (end - start);
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    const at = count === 1 ? 0 : (i * (values.length - 1)) / (count - 1);
    const low = Math.floor(at);
    const high = Math.min(values.length - 1, low + 1);
    out[i] = values[low] + (values[high] - values[low]) * (at - low);
  }
  return out;
}

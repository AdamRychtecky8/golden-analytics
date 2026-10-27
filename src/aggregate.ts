// Small, pure helpers that turn raw CSV strings into numbers, dates, bins, and groups.
// Every number the app shows is computed here (or in profile.ts / chartRules.ts using
// these helpers), never inside the charting library, so each one is testable and traceable.

export type Row = Record<string, string>;

/** A cell counts as missing only when it is empty after trimming whitespace. */
export function isMissing(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

// Plain decimal numbers only: "12", "-3.5", "1e3". No currency symbols or thousands
// separators; the input is a clean, typed CSV (D-010).
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function parseNumber(value: string | undefined): number | null {
  if (isMissing(value)) return null;
  const trimmed = value!.trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// ISO 8601 dates: "2025-03-14", optionally with a time ("2025-03-14T09:30:00Z").
// Ambiguous formats like 3/4/2025 are deliberately not accepted (is it March or April?).
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Returns the date as UTC milliseconds, or null if it isn't a valid ISO date. */
export function parseDate(value: string | undefined): number | null {
  if (isMissing(value)) return null;
  const trimmed = value!.trim();
  if (!DATE_PATTERN.test(trimmed)) return null;
  // Date-only strings are parsed as UTC midnight by the JS spec. Times without a zone
  // would be parsed as local time, so we pin them to UTC to keep buckets stable.
  const hasZone = /Z|[+-]\d{2}:?\d{2}$/.test(trimmed.slice(10));
  const iso = trimmed.length > 10 && !hasZone ? trimmed.replace(' ', 'T') + 'Z' : trimmed;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  // Reject impossible dates like 2025-02-30, which Date.parse would roll into March.
  const d = new Date(ms);
  const [y, m, day] = trimmed.slice(0, 10).split('-').map(Number);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) return null;
  return ms;
}

export type TimeUnit = 'day' | 'month' | 'year';

const DAY_MS = 86_400_000;

/**
 * Picks the time unit from the date range (D-013): short ranges by day, up to three
 * years by month, longer by year. Aim: enough points to show a shape, few enough
 * that one period is still readable.
 */
export function pickTimeUnit(minMs: number, maxMs: number): TimeUnit {
  const spanDays = (maxMs - minMs) / DAY_MS;
  if (spanDays <= 90) return 'day';
  if (spanDays <= 3 * 366) return 'month';
  return 'year';
}

/** The start of the period that contains `ms`, in UTC. */
export function bucketStart(ms: number, unit: TimeUnit): number {
  const d = new Date(ms);
  if (unit === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (unit === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}

/** Every period start from the first bucket to the last, so empty periods are visible. */
export function allBuckets(minMs: number, maxMs: number, unit: TimeUnit): number[] {
  const out: number[] = [];
  let cur = bucketStart(minMs, unit);
  const end = bucketStart(maxMs, unit);
  while (cur <= end) {
    out.push(cur);
    const d = new Date(cur);
    if (unit === 'day') cur += DAY_MS;
    else if (unit === 'month') cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    else cur = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
  return out;
}

export interface Bin {
  x0: number; // inclusive start
  x1: number; // exclusive end (the last bin also includes its end)
  count: number;
}

// Rounds a raw step up to 1, 2, or 5 × a power of ten, so bin edges are numbers
// a person would write down (0, 50, 100) instead of 0, 47.3, 94.6.
function niceStep(rawStep: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Equal-width bins with "nice" edges. Every value lands in exactly one bin. */
export function binNumbers(values: number[], maxBins = 10): Bin[] {
  if (values.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return [{ x0: min, x1: min, count: values.length }];

  const target = Math.min(maxBins, Math.max(1, Math.ceil(Math.sqrt(values.length))));
  const step = niceStep((max - min) / target);
  const start = Math.floor(min / step) * step;
  const binCount = Math.max(1, Math.ceil((max - start) / step));
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: round(start + i * step),
    x1: round(start + (i + 1) * step),
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(binCount - 1, Math.floor((v - start) / step));
    bins[i].count++;
  }
  return bins;
}

// Removes floating-point noise like 0.30000000000000004 from bin edges.
function round(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

export type Aggregate = 'sum' | 'mean';

/** Sum or mean of a list. The mean of an empty list is null (there is no value), not 0. */
export function aggregateValues(values: number[], how: Aggregate): number | null {
  if (how === 'sum') return values.reduce((a, b) => a + b, 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

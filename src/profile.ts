import {
  allBuckets,
  binNumbers,
  bucketStart,
  isMissing,
  parseDate,
  parseNumber,
  pickTimeUnit,
  type Bin,
  type Row,
  type TimeUnit,
} from './aggregate';

// Stevens' data types, simplified to the three the chart rules need
// (DATA511-viz-principles.md §2: "classify before you encode").
// Ordinal is not detected: a CSV doesn't say whether "S, M, L" has an order.
export type FieldType = 'nominal' | 'quantitative' | 'temporal';

export interface ValueCount {
  value: string;
  count: number;
}

export interface ColumnProfile {
  name: string;
  type: FieldType;
  count: number; // non-missing values
  missing: number;
  distinct: number;
  // Quantitative: numeric min/max. Temporal: UTC ms min/max.
  min?: number;
  max?: number;
  // Nominal: most common values, largest first.
  topValues?: ValueCount[];
  // Quantitative: histogram bins. Temporal: counts per period. Used by the mini distribution.
  bins?: Bin[];
  timeUnit?: TimeUnit;
}

export interface DataProfile {
  rowCount: number;
  columns: ColumnProfile[];
}

const TOP_VALUES = 5;

/**
 * Decides a column's type from its non-missing values. A column is quantitative only if
 * EVERY value is a plain number, temporal only if every value is an ISO date; otherwise
 * it's nominal. All-or-nothing keeps the rule predictable: one stray "n/a" makes the
 * column nominal rather than silently being dropped from a sum.
 */
export function detectType(values: string[]): FieldType {
  const present = values.filter((v) => !isMissing(v));
  if (present.length === 0) return 'nominal';
  if (present.every((v) => parseNumber(v) !== null)) return 'quantitative';
  if (present.every((v) => parseDate(v) !== null)) return 'temporal';
  return 'nominal';
}

export function profileColumn(name: string, values: string[]): ColumnProfile {
  const type = detectType(values);
  const present = values.filter((v) => !isMissing(v));
  const base = {
    name,
    type,
    count: present.length,
    missing: values.length - present.length,
    distinct: new Set(present.map((v) => v.trim())).size,
  };

  if (type === 'quantitative') {
    const nums = present.map((v) => parseNumber(v)!);
    const [min, max] = minMax(nums);
    return { ...base, min, max, bins: binNumbers(nums) };
  }

  if (type === 'temporal') {
    const times = present.map((v) => parseDate(v)!);
    const [min, max] = minMax(times);
    const timeUnit = pickTimeUnit(min, max);
    const counts = new Map<number, number>();
    for (const t of times) {
      const b = bucketStart(t, timeUnit);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const bins = allBuckets(min, max, timeUnit).map((b) => ({ x0: b, x1: b, count: counts.get(b) ?? 0 }));
    return { ...base, min, max, timeUnit, bins };
  }

  const counts = new Map<string, number>();
  for (const v of present) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
  const topValues = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    // Largest first; ties broken alphabetically so the order never depends on row order.
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, TOP_VALUES);
  return { ...base, topValues };
}

// A loop instead of Math.min(...values): spreading a large column into function
// arguments overflows the call stack at around 100k values.
function minMax(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export function profileDataset(columns: string[], rows: Row[]): DataProfile {
  return {
    rowCount: rows.length,
    columns: columns.map((c) => profileColumn(c, rows.map((r) => r[c] ?? ''))),
  };
}

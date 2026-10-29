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
  // Quantitative: whether adding values up means something (see classifyMeasure).
  measure?: MeasureKind;
}

/**
 * Additive: values can be summed and the total means something (revenue, units sold).
 * Average: only a mean makes sense. The total of every sale's price, a discount rate, or
 * an age describes nothing real, so these are never summed anywhere in the app.
 */
export type MeasureKind = 'additive' | 'average';

// Words in a column name that decide its kind, in order of precedence:
// 1. AVERAGE_FIRST: the name already says it's an average or a ratio ("avg_revenue",
//    "conversion_rate"), whatever else it contains.
// 2. ADDITIVE: amounts and counts. These win over the next list, because "total_price"
//    and "discount_amount" are sums of money even though they mention price/discount.
// 3. AVERAGE: quantities that describe one record, not a pile of them.
const AVERAGE_FIRST = ['avg', 'average', 'mean', 'median', 'rate', 'ratio', 'percent', 'percentage', 'pct', 'share'];
const ADDITIVE = [
  'revenue', 'sales', 'sale', 'amount', 'units', 'unit', 'quantity', 'qty', 'total', 'sum', 'count', 'cost', 'costs',
  'spend', 'spending', 'profit', 'income', 'volume', 'orders', 'visits', 'visitors', 'clicks', 'items', 'hours',
];
const AVERAGE = [
  'price', 'rating', 'ratings', 'discount', 'age', 'score', 'year', 'temperature', 'temp', 'latitude', 'lat',
  'longitude', 'lon', 'lng', 'margin', 'index', 'rank', 'grade', 'size', 'weight', 'height', 'duration', 'pages',
];

/**
 * Decides a number column's kind from its name. A name that matches no list is treated
 * as average only: a mean is always a true statement about the data, while the sum of a
 * column that shouldn't be summed is a confident-looking number that means nothing.
 * Being cautious costs a missing sum; being wrong would show a false one.
 */
export function classifyMeasure(name: string): MeasureKind {
  // "unitPrice", "unit_price", "Unit Price" → ["unit", "price"]
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const has = (list: string[]) => words.some((w) => list.includes(w));
  if (has(AVERAGE_FIRST) || name.includes('%')) return 'average';
  if (has(ADDITIVE)) {
    // "unit price" names one unit's price, not a count of units.
    if (words.includes('unit') && has(AVERAGE)) return 'average';
    return 'additive';
  }
  return 'average';
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
    return { ...base, min, max, bins: binNumbers(nums), measure: classifyMeasure(name) };
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

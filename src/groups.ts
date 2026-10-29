import { aggregateValues, allBuckets, bucketStart, isMissing, parseDate, parseNumber, type Aggregate, type Row, type TimeUnit } from './aggregate';
import { chooseRule, effectiveAggregate } from './chartRules';
import { filterRows, type ChartView } from './paths';
import type { ColumnProfile, DataProfile } from './profile';

// The groups behind a chart, as plain numbers: each bar's category or each line's period,
// with how many records it holds and its value. The insight checks (checks.ts) and the
// story facts (facts.ts) both read these, computed the same way buildChart computes them.

export interface Group {
  label: string; // "Hardcover", or a period's start date as an ISO day for time charts
  records: number;
  value: number | null; // the sum or mean of the measure; the record count when there is no measure
}

export interface Grouping {
  by: 'category' | 'period';
  field: ColumnProfile; // the category or date column the groups come from
  measure: ColumnProfile | null; // null: groups are counted, not measured
  aggregate: Aggregate | 'count';
  groups: Group[]; // categories: largest value first; periods: in time order, empty ones included
  total: number | null; // sum of the measure (or of records) over all groups; null for means
  records: number; // rows in the chart
  timeUnit?: TimeUnit;
}

/**
 * Groups for charts that compare groups: bars, lines, and lines per category (grouped by
 * category, since that's what the series compare). Histograms, scatters, and heatmaps
 * return null: they have no single list of groups.
 */
export function groupView(view: ChartView, profile: DataProfile, rows: Row[]): Grouping | null {
  const cols = view.fields.map((n) => profile.columns.find((c) => c.name === n));
  if (cols.length === 0 || cols.some((c) => c === undefined)) return null;
  const fields = cols as ColumnProfile[];
  const rule = chooseRule(fields.map((f) => f.type));
  // Same rows the chart uses: the filtered slice, minus rows missing a charted field.
  const subset = filterRows(rows, view.filters).filter((r) => fields.every((f) => !isMissing(r[f.name])));
  const measure = fields.find((f) => f.type === 'quantitative') ?? null;
  const how = effectiveAggregate(fields, view.aggregate);

  if (rule === 'sorted-bars' || rule === 'count-bars' || rule === 'count-line-by-category') {
    const cat = fields.find((f) => f.type === 'nominal')!;
    const useMeasure = rule === 'sorted-bars' ? measure : null;
    const byLabel = new Map<string, number[]>();
    for (const r of subset) {
      const k = r[cat.name].trim();
      if (!byLabel.has(k)) byLabel.set(k, []);
      byLabel.get(k)!.push(useMeasure ? parseNumber(r[useMeasure.name])! : 1);
    }
    const groups = [...byLabel].map(([label, nums]) => ({
      label,
      records: nums.length,
      value: useMeasure ? aggregateValues(nums, how) : nums.length,
    }));
    groups.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.label.localeCompare(b.label));
    return finish('category', cat, useMeasure, useMeasure ? how : 'count', groups, subset.length);
  }

  if (rule === 'line' || rule === 'count-line') {
    const date = fields.find((f) => f.type === 'temporal')!;
    const unit = date.timeUnit ?? 'month';
    const buckets = subset.length > 0 ? allBuckets(date.min!, date.max!, unit) : [];
    const byBucket = new Map<number, number[]>(buckets.map((b) => [b, []]));
    for (const r of subset) byBucket.get(bucketStart(parseDate(r[date.name])!, unit))!.push(measure ? parseNumber(r[measure.name])! : 1);
    const groups = [...byBucket].map(([start, nums]) => ({
      label: new Date(start).toISOString().slice(0, 10),
      records: nums.length,
      value: measure ? aggregateValues(nums, how) : nums.length,
    }));
    return { ...finish('period', date, measure, measure ? how : 'count', groups, subset.length), timeUnit: unit };
  }
  return null;
}

function finish(
  by: Grouping['by'],
  field: ColumnProfile,
  measure: ColumnProfile | null,
  aggregate: Grouping['aggregate'],
  groups: Group[],
  records: number,
): Grouping {
  // A total only makes sense when the groups are parts of a whole: sums and counts.
  const total = aggregate === 'mean' ? null : groups.reduce((s, g) => s + (g.value ?? 0), 0);
  return { by, field, measure, aggregate, groups, total, records };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 2193", "Mar 14, 2193", or "2193", matching the chart axes. Always UTC. */
export function periodLabel(isoDay: string, unit: TimeUnit): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (unit === 'year') return String(y);
  if (unit === 'month') return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

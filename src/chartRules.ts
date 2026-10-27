import type { TopLevelSpec } from 'vega-lite';
import {
  aggregateValues,
  allBuckets,
  binNumbers,
  bucketStart,
  isMissing,
  parseDate,
  parseNumber,
  pickTimeUnit,
  type Aggregate,
  type Row,
  type TimeUnit,
} from './aggregate';
import type { ColumnProfile, FieldType } from './profile';

// Chart choice is deterministic: the same field types always give the same chart (D-012).
// The reasoning behind each rule lives in these comments, not in the UI. Section numbers
// refer to DATA511-viz-principles.md (private course notes, D-017).

export type RuleId =
  | 'line'
  | 'sorted-bars'
  | 'scatter'
  | 'histogram'
  | 'count-bars'
  | 'count-line'
  | 'count-line-by-category'
  | 'count-heatmap';

// Colors are decided here because they carry meaning (which mark is highlighted).
// Keep them in sync with the CSS variables in styles.css.
export const NAVY = '#14213d';
export const GREY = '#c4c0b6';
export const ACCENT = '#e8590c';
// Hues for nominal series (§4: hue is perceived as unordered, so it suits categories).
// Orange is left out on purpose: it is reserved for the highlight.
export const SERIES_COLORS = ['#14213d', '#5b7aa8', '#7f9a65', '#9a6a8f', '#a08a5c', '#4f8f8f', '#7a7a7a', '#b07a6e', '#3c5a3c'];

// Beyond this many categories a chart stops being readable; the rest are combined into
// one "Other" bar so nothing is dropped and the note says how many were combined.
const MAX_BARS = 20;
const MAX_SERIES = 8;
const MAX_HEATMAP = 12;

/**
 * Which chart fits a set of field types. Order-insensitive: "region + revenue" and
 * "revenue + region" give the same rule. Returns null when no rule covers the combination.
 */
export function chooseRule(types: FieldType[]): RuleId | null {
  const key = [...types].sort().join('+');
  switch (key) {
    // §6 (Few): time series → lines, because slope is meaningful and dates are an
    // interval scale, so connecting points is honest.
    case 'quantitative+temporal':
      return 'line';
    // §6: nominal comparison and ranking → sorted bars. Position/length is the most
    // accurate channel for quantities (§3, Mackinlay), and sorting turns a comparison
    // into a ranking. Lines are wrong here: they imply continuity between categories.
    case 'nominal+quantitative':
      return 'sorted-bars';
    // §6: correlation → scatter plot, two quantities on the two position channels.
    case 'quantitative+quantitative':
      return 'scatter';
    // §6: distribution → histogram. Shows shape, gaps, and outliers that a mean hides
    // (§1, Anscombe's Quartet).
    case 'quantitative':
      return 'histogram';
    // One category: the only honest number is how often each value appears, as bars.
    case 'nominal':
      return 'count-bars';
    // One date: how many records per period, as a line (time series, §6).
    case 'temporal':
      return 'count-line';
    // Date + category: one line per category. Hue separates the series because it is
    // the best remaining channel for nominal data once position is used (§3).
    case 'nominal+temporal':
      return 'count-line-by-category';
    // Two categories: a grid of counts. Lightness (value) encodes the count because
    // value is perceived as ordered (§4), unlike hue.
    case 'nominal+nominal':
      return 'count-heatmap';
    default:
      return null;
  }
}

/** Rules whose y-axis is a sum or mean, so the sum/mean toggle applies. */
export function usesAggregate(rule: RuleId): boolean {
  return rule === 'line' || rule === 'sorted-bars';
}

export interface ChartResult {
  rule: RuleId;
  title: string;
  spec: TopLevelSpec;
  // Plain-language facts about what the chart does NOT show, e.g. rows skipped because a
  // value was missing. Shown under the chart so nothing disappears silently.
  notes: string[];
}

export interface ChartOptions {
  aggregate: Aggregate;
  // The key of the highlighted mark, or null. Each datum gets a `key` field so a click
  // can name exactly one mark (or one series, for multi-line charts).
  highlight: string | null;
  // Chart height in pixels. Defaults to the story card's size; path cards use a smaller one.
  height?: number;
}

const TIME_FORMAT: Record<TimeUnit, string> = { day: '%b %d, %Y', month: '%b %Y', year: '%Y' };
const NUMBER_FORMAT = ',.2~f';
const HEIGHT = 260;

export function aggregateLabel(how: Aggregate, field: string): string {
  return `${how === 'sum' ? 'Sum' : 'Mean'} of ${field}`;
}

/** A short plain title for a chart, used for previews and chart ideas. */
export function chartTitle(fields: ColumnProfile[], how: Aggregate): string | null {
  const rule = chooseRule(fields.map((f) => f.type));
  if (!rule) return null;
  const [a, b] = orderFields(rule, fields);
  const unit = (f: ColumnProfile) => (f.timeUnit ? `by ${f.timeUnit}` : 'over time');
  switch (rule) {
    case 'line':
      return `${aggregateLabel(how, b.name)} ${unit(a)}`;
    case 'sorted-bars':
      return `${aggregateLabel(how, b.name)} by ${a.name}`;
    case 'scatter':
      return `${a.name} vs ${b.name}`;
    case 'histogram':
      return `Distribution of ${a.name}`;
    case 'count-bars':
      return `Records by ${a.name}`;
    case 'count-line':
      return `Records ${unit(a)}`;
    case 'count-line-by-category':
      return `Records ${unit(a)}, by ${b.name}`;
    case 'count-heatmap':
      return `Records by ${a.name} and ${b.name}`;
  }
}

/**
 * Puts fields in the order a rule needs them: the date first for time charts, the
 * category first for bars. Scatter and heatmap keep the user's selection order
 * (first selected → x axis), since either way round is valid.
 */
function orderFields(rule: RuleId, fields: ColumnProfile[]): ColumnProfile[] {
  const rank: Record<RuleId, FieldType[]> = {
    line: ['temporal', 'quantitative'],
    'sorted-bars': ['nominal', 'quantitative'],
    'count-line-by-category': ['temporal', 'nominal'],
    scatter: [],
    histogram: [],
    'count-bars': [],
    'count-line': [],
    'count-heatmap': [],
  };
  const order = rank[rule];
  if (order.length === 0) return fields;
  return [...fields].sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type));
}

/**
 * Builds the chart for the selected fields: computes every number from the rows, then
 * wraps them in a Vega-Lite spec that only draws (D-019). Returns null if no rule fits.
 */
export function buildChart(fields: ColumnProfile[], rows: Row[], options: ChartOptions): ChartResult | null {
  const rule = chooseRule(fields.map((f) => f.type));
  if (!rule || fields.length === 0) return null;
  const ordered = orderFields(rule, fields);
  const title = chartTitle(fields, options.aggregate)!;

  // Rows missing any selected field can't be placed on the chart. Count them out loud.
  const names = ordered.map((f) => f.name);
  const complete = rows.filter((r) => names.every((n) => !isMissing(r[n])));
  const notes: string[] = [];
  const skipped = rows.length - complete.length;
  if (skipped > 0) {
    notes.push(`${skipped} of ${rows.length} rows are not shown because ${names.join(' or ')} is missing.`);
  }

  const built = BUILDERS[rule](ordered, complete, options, notes);
  // usermeta is Vega-Lite's slot for app data; Vega ignores it. Chart.tsx reads it to know
  // whether a click on a line counts. On a single line every point has its own key, so
  // only the points are clickable; on a multi-series line the line itself names a series.
  const usermeta = { lineClickable: rule === 'count-line-by-category' };
  // The builders return plain objects rather than Vega-Lite's own (very large) types, to
  // keep them readable. The tests check the specs' contents; `as unknown as` tells
  // TypeScript we've taken on that responsibility.
  const spec = { ...built, usermeta, height: options.height ?? HEIGHT, width: 'container' } as unknown as TopLevelSpec;
  return { rule, title, notes, spec };
}

type Builder = (fields: ColumnProfile[], rows: Row[], options: ChartOptions, notes: string[]) => object;

// Highlight colors: with nothing highlighted every mark is navy. With a highlight, only
// that mark is orange and the rest turn grey. One channel, one accent, so the highlighted
// mark pops out pre-attentively (§4: pop-out works for a single feature, not conjunctions).
function markColor(highlight: string | null, defaultColor: object = { value: NAVY }) {
  if (highlight === null) return defaultColor;
  return { condition: { test: `datum.key === ${JSON.stringify(highlight)}`, value: ACCENT }, value: GREY };
}

/** Keeps the largest groups and combines the rest into "Other (n values)", listed last. */
function topWithOther<T>(
  groups: Map<string, T[]>,
  limit: number,
  size: (items: T[]) => number,
): { kept: [string, T[]][]; otherLabel: string | null; other: T[] } {
  const sorted = [...groups.entries()].sort((a, b) => size(b[1]) - size(a[1]) || a[0].localeCompare(b[0]));
  if (sorted.length <= limit) return { kept: sorted, otherLabel: null, other: [] };
  const kept = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1);
  return { kept, otherLabel: `Other (${rest.length} values)`, other: rest.flatMap(([, items]) => items) };
}

function groupBy(rows: Row[], field: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r[field].trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return groups;
}

function timeAxis(field: ColumnProfile, unit: TimeUnit) {
  return {
    field: 'period',
    type: 'temporal',
    // UTC scale: our buckets are UTC midnights (aggregate.ts); a local scale would show
    // "Dec 31" for January in US time zones.
    // The UTC scale also makes the axis labels use UTC. Vega-Lite drops an axis format
    // that has formatType 'utc' (it logs a warning), so the format is given on its own.
    scale: { type: 'utc' },
    title: `${field.name} (by ${unit})`,
    axis: { format: TIME_FORMAT[unit] },
  };
}

function timeTooltip(unit: TimeUnit) {
  return { field: 'period', type: 'temporal', title: 'Period', format: TIME_FORMAT[unit], formatType: 'utc' };
}

/** Time buckets for a date field, using the profiler's unit so previews and cards agree. */
function timeBuckets(field: ColumnProfile, rows: Row[]) {
  const times = rows.map((r) => parseDate(r[field.name])!);
  const unit = field.timeUnit ?? pickTimeUnit(field.min ?? 0, field.max ?? 0);
  const buckets = rows.length > 0 ? allBuckets(field.min!, field.max!, unit) : [];
  return { times, unit, buckets };
}

// Time series layers: a line for the trend and points so each period can be clicked.
function lineLayers(lineColor: object, pointColor: object, tooltip: object[]) {
  return [
    { mark: { type: 'line', strokeWidth: 2 }, encoding: { color: lineColor } },
    { mark: { type: 'point', filled: true, size: 45 }, encoding: { color: pointColor, tooltip } },
  ];
}

const BUILDERS: Record<RuleId, Builder> = {
  line([date, num], rows, { aggregate, highlight }, notes) {
    const { times, unit, buckets } = timeBuckets(date, rows);
    const byBucket = new Map<number, number[]>(buckets.map((b) => [b, []]));
    rows.forEach((r, i) => byBucket.get(bucketStart(times[i], unit))!.push(parseNumber(r[num.name])!));

    const values: object[] = [];
    let empty = 0;
    for (const [period, nums] of byBucket) {
      const value = aggregateValues(nums, aggregate);
      // A sum over no rows is 0, which is a real value. A mean over no rows doesn't
      // exist, so that period is left out and the note says so instead of drawing a 0.
      if (value === null) {
        empty++;
        continue;
      }
      values.push({ period, value, rows: nums.length, key: String(period) });
    }
    if (empty > 0) notes.push(`${empty} ${unit}s with no records have no ${aggregate} and are left out of the line.`);

    const label = aggregateLabel(aggregate, num.name);
    return {
      data: { values },
      encoding: { x: timeAxis(date, unit), y: { field: 'value', type: 'quantitative', title: label } },
      layer: lineLayers(highlight === null ? { value: NAVY } : { value: GREY }, markColor(highlight), [
        timeTooltip(unit),
        { field: 'value', type: 'quantitative', title: label, format: NUMBER_FORMAT },
        { field: 'rows', type: 'quantitative', title: 'Records' },
      ]),
    };
  },

  'sorted-bars'([cat, num], rows, { aggregate, highlight }) {
    const { kept, otherLabel, other } = topWithOther(groupBy(rows, cat.name), MAX_BARS, (g) => g.length);
    const toDatum = (label: string, group: Row[]) => ({
      category: label,
      value: aggregateValues(group.map((r) => parseNumber(r[num.name])!), aggregate),
      rows: group.length,
      key: label,
    });
    const values = kept.map(([label, group]) => toDatum(label, group));
    // Largest first (§6: ranking). "Other" always goes last so it never reads as a winner.
    values.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    if (otherLabel) values.push(toDatum(otherLabel, other));

    const label = aggregateLabel(aggregate, num.name);
    return {
      data: { values },
      mark: { type: 'bar' },
      encoding: {
        y: { field: 'category', type: 'nominal', sort: null, title: cat.name },
        // §6: bars start at zero. Length encodes the value, so a cut baseline would lie.
        x: { field: 'value', type: 'quantitative', title: label, scale: { zero: true } },
        color: markColor(highlight),
        tooltip: [
          { field: 'category', title: cat.name },
          { field: 'value', type: 'quantitative', title: label, format: NUMBER_FORMAT },
          { field: 'rows', type: 'quantitative', title: 'Records' },
        ],
      },
    };
  },

  scatter([xField, yField], rows, { highlight }) {
    // No aggregation: each point is one record, so the key is the row's position.
    const values = rows.map((r, i) => ({
      x: parseNumber(r[xField.name])!,
      y: parseNumber(r[yField.name])!,
      key: String(i),
    }));
    return {
      data: { values },
      mark: { type: 'point', filled: true, size: 40, opacity: 0.75 },
      encoding: {
        // Scatter axes don't need to start at zero: position, not length, carries the value.
        x: { field: 'x', type: 'quantitative', title: xField.name, scale: { zero: false } },
        y: { field: 'y', type: 'quantitative', title: yField.name, scale: { zero: false } },
        color: markColor(highlight),
        tooltip: [
          { field: 'x', type: 'quantitative', title: xField.name, format: NUMBER_FORMAT },
          { field: 'y', type: 'quantitative', title: yField.name, format: NUMBER_FORMAT },
        ],
      },
    };
  },

  histogram([num], rows, { highlight }) {
    const bins = binNumbers(rows.map((r) => parseNumber(r[num.name])!));
    // Every value is the same: a histogram would have one zero-width bar, so show the
    // single value as one labeled bar instead.
    if (bins.length === 1 && bins[0].x0 === bins[0].x1) {
      return BUILDERS['count-bars']([num], rows, { aggregate: 'sum', highlight }, []);
    }
    const values = bins.map((b) => ({ ...b, key: String(b.x0) }));
    return {
      data: { values },
      mark: { type: 'bar', binSpacing: 1 },
      encoding: {
        x: { field: 'x0', type: 'quantitative', bin: { binned: true }, title: num.name },
        x2: { field: 'x1' },
        y: { field: 'count', type: 'quantitative', title: 'Count of records', scale: { zero: true } },
        color: markColor(highlight),
        tooltip: [
          { field: 'x0', type: 'quantitative', title: 'From' },
          { field: 'x1', type: 'quantitative', title: 'To (exclusive)' },
          { field: 'count', type: 'quantitative', title: 'Records' },
        ],
      },
    };
  },

  'count-bars'([cat], rows, { highlight }) {
    const { kept, otherLabel, other } = topWithOther(groupBy(rows, cat.name), MAX_BARS, (g) => g.length);
    const values = kept.map(([label, group]) => ({ category: label, count: group.length, key: label }));
    if (otherLabel) values.push({ category: otherLabel, count: other.length, key: otherLabel });
    return {
      data: { values },
      mark: { type: 'bar' },
      encoding: {
        y: { field: 'category', type: 'nominal', sort: null, title: cat.name },
        x: { field: 'count', type: 'quantitative', title: 'Count of records', scale: { zero: true } },
        color: markColor(highlight),
        tooltip: [
          { field: 'category', title: cat.name },
          { field: 'count', type: 'quantitative', title: 'Records' },
        ],
      },
    };
  },

  'count-line'([date], rows, { highlight }) {
    const { times, unit, buckets } = timeBuckets(date, rows);
    const counts = new Map<number, number>(buckets.map((b) => [b, 0]));
    for (const t of times) counts.set(bucketStart(t, unit), counts.get(bucketStart(t, unit))! + 1);
    // Empty periods stay in as 0: a count of nothing is a real zero, and dropping it
    // would let the line skip over a gap (§6: connection implies continuity).
    const values = [...counts].map(([period, count]) => ({ period, count, key: String(period) }));
    return {
      data: { values },
      encoding: { x: timeAxis(date, unit), y: { field: 'count', type: 'quantitative', title: 'Count of records' } },
      layer: lineLayers(highlight === null ? { value: NAVY } : { value: GREY }, markColor(highlight), [
        timeTooltip(unit),
        { field: 'count', type: 'quantitative', title: 'Records' },
      ]),
    };
  },

  'count-line-by-category'([date, cat], rows, { highlight }, notes) {
    const { times, unit, buckets } = timeBuckets(date, rows);
    const indexed = rows.map((r, i) => ({ ...r, __t: String(times[i]) }));
    const { kept, otherLabel, other } = topWithOther(groupBy(indexed, cat.name), MAX_SERIES, (g) => g.length);
    const series: [string, Row[]][] = otherLabel ? [...kept, [otherLabel, other]] : kept;
    if (otherLabel) notes.push(`Only the ${MAX_SERIES - 1} most common ${cat.name} values get their own line; the rest are combined.`);

    const values: object[] = [];
    for (const [label, group] of series) {
      const counts = new Map<number, number>(buckets.map((b) => [b, 0]));
      for (const r of group) {
        const b = bucketStart(Number(r.__t), unit);
        counts.set(b, counts.get(b)! + 1);
      }
      // The key is the category, so clicking any point highlights that whole series.
      for (const [period, count] of counts) values.push({ period, count, category: label, key: label });
    }

    const palette = {
      field: 'category',
      type: 'nominal',
      title: cat.name,
      sort: series.map(([label]) => label),
      scale: { range: SERIES_COLORS },
    };
    // With a highlight, the chosen series is orange and every other series grey.
    const color = markColor(highlight, palette);
    return {
      data: { values },
      encoding: {
        x: timeAxis(date, unit),
        y: { field: 'count', type: 'quantitative', title: 'Count of records' },
        detail: { field: 'category', type: 'nominal' },
      },
      layer: lineLayers(color, color, [
        timeTooltip(unit),
        { field: 'category', title: cat.name },
        { field: 'count', type: 'quantitative', title: 'Records' },
      ]),
    };
  },

  'count-heatmap'([xField, yField], rows, { highlight }) {
    const limitAxis = (field: string) => {
      const { kept, otherLabel } = topWithOther(groupBy(rows, field), MAX_HEATMAP, (g) => g.length);
      const keep = new Set(kept.map(([k]) => k));
      const label = (v: string) => (keep.has(v.trim()) ? v.trim() : otherLabel!);
      return { label, order: [...kept.map(([k]) => k), ...(otherLabel ? [otherLabel] : [])] };
    };
    const xs = limitAxis(xField.name);
    const ys = limitAxis(yField.name);

    // Every combination is listed, including empty ones, so a 0 shows as a pale cell
    // rather than a hole that could be mistaken for missing data.
    const counts = new Map<string, number>();
    for (const x of xs.order) for (const y of ys.order) counts.set(`${x}|${y}`, 0);
    for (const r of rows) {
      const k = `${xs.label(r[xField.name])}|${ys.label(r[yField.name])}`;
      counts.set(k, counts.get(k)! + 1);
    }
    const values = [...counts].map(([key, count]) => {
      const [x, y] = key.split('|');
      return { x, y, count, key };
    });

    return {
      data: { values },
      mark: { type: 'rect', stroke: '#f7f3ea', strokeWidth: 1 },
      encoding: {
        x: { field: 'x', type: 'nominal', sort: xs.order, title: xField.name },
        y: { field: 'y', type: 'nominal', sort: ys.order, title: yField.name },
        // A light-to-navy lightness ramp: more records → darker. Zero is the palest cell.
        color:
          highlight === null
            ? { field: 'count', type: 'quantitative', title: 'Records', scale: { range: ['#efe9dc', NAVY], zero: true } }
            : markColor(highlight),
        tooltip: [
          { field: 'x', title: xField.name },
          { field: 'y', title: yField.name },
          { field: 'count', type: 'quantitative', title: 'Records' },
        ],
      },
    };
  },
};

export interface ChartIdea {
  fields: string[];
  title: string;
}

/**
 * Level 1 chart ideas: every chart the rules can make from the current selection.
 * Nothing selected → one idea per field. One field → that field alone, plus that field
 * paired with each other field. Two fields → the pair, plus each field alone.
 */
export function chartIdeas(selected: ColumnProfile[], all: ColumnProfile[], how: Aggregate): ChartIdea[] {
  const combos: ColumnProfile[][] = [];
  if (selected.length === 0) all.forEach((f) => combos.push([f]));
  if (selected.length === 1) {
    combos.push(selected);
    all.filter((f) => f.name !== selected[0].name).forEach((f) => combos.push([selected[0], f]));
  }
  if (selected.length === 2) combos.push(selected, [selected[0]], [selected[1]]);

  return combos
    .map((fields) => ({ fields: fields.map((f) => f.name), title: chartTitle(fields, how) }))
    .filter((idea): idea is ChartIdea => idea.title !== null);
}

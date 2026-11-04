import { isMissing, type Aggregate, type Row } from './aggregate';
import { buildChart, type ChartOptions, type ChartResult } from './chartRules';
import { whole } from './format';
import type { ColumnProfile, DataProfile } from './profile';

// Views: what a chart shows (fields, sum or mean, filters), filtering rows to a slice, and
// drawing a view. What the AI may see of the data is in aiProfile.ts.

/** Keep only rows where a category column equals one of its actual values. */
export interface ViewFilter {
  field: string;
  value: string;
}

/** What a chart shows: the same three things whether it came from the menu or "Build my own chart". */
export interface ChartView {
  fields: string[];
  aggregate: Aggregate;
  filters: ViewFilter[]; // all must hold; empty = every row
}

// A view narrows the data by at most this many filters; each "go deeper" adds one (D-051, D-069).
export const MAX_FILTERS = 3;

// ---------------------------------------------------------------------------------------
// Turning a view into rows and a chart.

/** The rows every filter keeps. Values are compared trimmed, the way the profiler counts them. */
export function filterRows(rows: Row[], filters: ViewFilter[]): Row[] {
  if (filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => !isMissing(r[f.field]) && r[f.field].trim() === f.value));
}

/** "genre is Fiction and format is Hardcover": a slice in words, wherever one is named. */
export const whereText = (filters: ViewFilter[]) => filters.map((f) => `${f.field} is ${f.value}`).join(' and ');

/** "genre = Fiction · format = Hardcover", for titles. */
export function describeFilters(filters: ViewFilter[], joiner = ' · '): string {
  return filters.map((f) => `${f.field} = ${f.value}`).join(joiner);
}

/**
 * Builds the chart for a view: filters the rows (if there's a filter), then hands them to
 * buildChart. A filter is always named in the title and
 * in a note with its row count, so a narrowed chart can't pass for the whole dataset.
 */
export function chartForView(
  view: ChartView,
  profile: DataProfile,
  rows: Row[],
  options: Pick<ChartOptions, 'highlight' | 'many' | 'groupName'>,
): ChartResult | null {
  const cols: ColumnProfile[] = [];
  for (const name of view.fields) {
    const col = profile.columns.find((c) => c.name === name);
    if (!col) return null; // a field the current dataset doesn't have
    cols.push(col);
  }
  const subset = filterRows(rows, view.filters);
  const chart = buildChart(cols, subset, { aggregate: view.aggregate, ...options });
  if (!chart || view.filters.length === 0) return chart;
  const where = whereText(view.filters);
  return {
    ...chart,
    title: `${chart.title} · ${describeFilters(view.filters)}`,
    notes: [`Only rows where ${where}: ${whole.format(subset.length)} of ${whole.format(rows.length)}.`, ...chart.notes],
  };
}

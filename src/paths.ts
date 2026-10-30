import { isMissing, type Aggregate, type Row } from './aggregate';
import { buildChart, type ChartResult } from './chartRules';
import type { ColumnProfile, DataProfile, FieldType } from './profile';
import type { Persona } from './personas';

// Views and paths: what a chart shows (fields, sum or mean, filters), filtering rows to a
// slice, drawing a view, and the profile summary the AI is allowed to see (D-011). Path and
// PathDraft are kept for story.ts (Level 3's drafting, which Phase 5 may reuse).

export const PATH_KINDS = ['trend', 'comparison', 'outlier', 'distribution', 'driver'] as const;
export type PathKind = (typeof PATH_KINDS)[number];

/** Where a path came from, shown on every path card and on the story card. */
export type PathSource = 'ai' | 'rules';

/** Keep only rows where a category column equals one of its actual values. */
export interface PathFilter {
  field: string;
  value: string;
}

/** What a chart shows: the same three things whether it came from the menu or "Build my own chart". */
export interface ChartView {
  fields: string[];
  aggregate: Aggregate;
  filters: PathFilter[]; // all must hold; empty = every row
}

// A path narrows the data by at most this many filters. Each "go deeper" adds one, so the
// tree is at most three levels below a top-level path with no filter (D-051).
export const MAX_FILTERS = 3;

export interface Path extends ChartView {
  id: string; // position in the tree: "p2" is the second top-level path, "p2.1" its first follow-up
  question: string;
  kind: PathKind;
  parent: string | null; // the parent path's id, or null for top-level paths
  source: PathSource;
}

/** A path's question and chart, without its place in a tree. */
export type PathDraft = Pick<Path, 'question' | 'kind' | 'fields' | 'aggregate' | 'filters'>;

// ---------------------------------------------------------------------------------------
// What an AI handler is allowed to see (D-011): the profile and the persona, never raw rows.

export interface ColumnSummary {
  name: string;
  type: FieldType;
  missing: number;
  distinct: number;
  measure?: 'additive' | 'average'; // numbers only: whether a sum means anything (D-050)
  min?: number | string; // numbers as numbers, dates as ISO strings
  max?: number | string;
  topValues?: { value: string; count: number }[];
}

export interface SuggestRequest {
  profile: { rowCount: number; columns: ColumnSummary[] };
  persona: Pick<Persona, 'domain' | 'role' | 'purpose'>;
  parent: PathDraft | null;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Copies only the summary fields out of the profile. Bins and anything row-level stay home. */
export function summarizeProfile(profile: DataProfile): SuggestRequest['profile'] {
  return {
    rowCount: profile.rowCount,
    columns: profile.columns.map((c) => {
      const base: ColumnSummary = { name: c.name, type: c.type, missing: c.missing, distinct: c.distinct };
      if (c.count === 0) return base;
      if (c.type === 'quantitative') return { ...base, measure: c.measure, min: c.min, max: c.max };
      if (c.type === 'temporal') return { ...base, min: isoDate(c.min!), max: isoDate(c.max!) };
      return { ...base, topValues: c.topValues };
    }),
  };
}

// ---------------------------------------------------------------------------------------
// Turning a path into rows and a chart.

/** The rows every filter keeps. Values are compared trimmed, the way the profiler counts them. */
export function filterRows(rows: Row[], filters: PathFilter[]): Row[] {
  if (filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => !isMissing(r[f.field]) && r[f.field].trim() === f.value));
}

/** "genre = Fiction · format = Hardcover", for titles. */
export function describeFilters(filters: PathFilter[], joiner = ' · '): string {
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
  options: { highlight: string | null; height?: number },
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
  const where = view.filters.map((f) => `${f.field} is ${f.value}`).join(' and ');
  return {
    ...chart,
    title: `${chart.title} · ${describeFilters(view.filters)}`,
    notes: [`Only rows where ${where}: ${subset.length} of ${rows.length}.`, ...chart.notes],
  };
}

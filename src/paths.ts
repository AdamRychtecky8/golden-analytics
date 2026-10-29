import { isMissing, type Aggregate, type Row } from './aggregate';
import { buildChart, canSum, chooseRule, usesAggregate, type ChartResult } from './chartRules';
import type { ColumnProfile, DataProfile, FieldType } from './profile';
import type { Persona } from './personas';

// Analytical paths (Level 2). A path is a question plus the chart that answers it. The AI
// (or the rule-based fallback) only fills in this plain data; code checks every field and
// computes every number (D-011). Nothing here calls the AI.

export const PATH_KINDS = ['trend', 'comparison', 'outlier', 'distribution', 'driver'] as const;
export type PathKind = (typeof PATH_KINDS)[number];

/** Where a path came from, shown on every path card and on the story card. */
export type PathSource = 'ai' | 'rules';

/** Keep only rows where a category column equals one of its actual values. */
export interface PathFilter {
  field: string;
  value: string;
}

/** What a chart shows: the same three things whether it came from Level 0/1 or a path. */
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

/** The part of a path the AI writes (and the part it sees of a parent). */
export type PathDraft = Pick<Path, 'question' | 'kind' | 'fields' | 'aggregate' | 'filters'>;

// ---------------------------------------------------------------------------------------
// What the AI is allowed to see (D-011): the profile and the persona, never raw rows.

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

export function buildRequest(profile: DataProfile, persona: Persona, parent: Path | null): SuggestRequest {
  return {
    profile: summarizeProfile(profile),
    persona: { domain: persona.domain, role: persona.role, purpose: persona.purpose },
    parent: parent ? toDraft(parent) : null,
  };
}

function toDraft(p: PathDraft): PathDraft {
  return { question: p.question, kind: p.kind, fields: p.fields, aggregate: p.aggregate, filters: p.filters };
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
 * the same buildChart that Levels 0 and 1 use. A filter is always named in the title and
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

/**
 * Two views show the same chart if they use the same fields, filter, and (only where it
 * matters) the same sum/mean. Field order is ignored: "region + revenue" is one chart.
 */
export function sameView(a: ChartView, b: ChartView, profile: DataProfile): boolean {
  if ([...a.fields].sort().join('|') !== [...b.fields].sort().join('|')) return false;
  if (filterKey(a.filters) !== filterKey(b.filters)) return false;
  const types = a.fields.map((n) => profile.columns.find((c) => c.name === n)?.type);
  const rule = types.every((t) => t !== undefined) ? chooseRule(types as FieldType[]) : null;
  return rule !== null && usesAggregate(rule) ? a.aggregate === b.aggregate : true;
}

/** Filters as one comparable string, in any order: "format=Hardcover|genre=Fiction". */
function filterKey(filters: PathFilter[]): string {
  return filters.map((f) => `${f.field}=${f.value}`).sort().join('|');
}

/** Whether `child` keeps every one of the parent's filters. */
function keepsFilters(child: PathFilter[], parent: PathFilter[]): boolean {
  return parent.every((p) => child.some((c) => c.field === p.field && c.value === p.value));
}

// ---------------------------------------------------------------------------------------
// Validation: code checks everything the AI returns. Anything that fails is dropped.

export const PATHS_PER_LEVEL = 3;
const MAX_QUESTION_WORDS = 20; // the prompt asks for under ~12; this only catches runaways
const MAX_QUESTION_CHARS = 140;

export interface ValidationContext {
  profile: DataProfile;
  rows: Row[];
  parent: Path | null;
}

export interface ValidationResult {
  paths: PathDraft[]; // valid drafts, in the order given, at most PATHS_PER_LEVEL
  rejected: string[]; // why each dropped candidate was dropped (for tests and the console)
}

/**
 * Checks raw candidates (whatever the AI sent, or the fallback generator's drafts) and
 * keeps the valid ones. `unknown` on purpose: AI output is untrusted until each field has
 * been checked here, and TypeScript makes us check before we use it.
 */
export function validatePaths(candidates: unknown, ctx: ValidationContext, already: PathDraft[] = []): ValidationResult {
  const accepted: PathDraft[] = [];
  const rejected: string[] = [];
  const list = Array.isArray(candidates) ? candidates : [];
  if (!Array.isArray(candidates)) rejected.push('Response had no list of paths.');

  for (const raw of list) {
    if (already.length + accepted.length >= PATHS_PER_LEVEL) break;
    const result = checkOne(raw, ctx);
    if (typeof result === 'string') {
      rejected.push(result);
      continue;
    }
    const taken = [...already, ...accepted];
    if (taken.some((p) => p.kind === result.kind)) {
      rejected.push(`"${result.question}": a ${result.kind} path is already shown.`);
    } else if (taken.some((p) => sameView(p, result, ctx.profile))) {
      rejected.push(`"${result.question}": the same chart is already shown.`);
    } else {
      accepted.push(result);
    }
  }
  return { paths: accepted, rejected };
}

/** Checks one candidate. Returns a clean draft, or a sentence saying why it was dropped. */
function checkOne(raw: unknown, { profile, rows, parent }: ValidationContext): PathDraft | string {
  if (typeof raw !== 'object' || raw === null) return 'Candidate is not an object.';
  const c = raw as Record<string, unknown>;

  const question = typeof c.question === 'string' ? c.question.trim().replace(/\s+/g, ' ') : '';
  if (!question) return 'Candidate has no question.';
  if (question.length > MAX_QUESTION_CHARS || question.split(' ').length > MAX_QUESTION_WORDS) {
    return `"${question.slice(0, 40)}…": question is too long.`;
  }
  const label = `"${question}"`;

  if (!PATH_KINDS.includes(c.kind as PathKind)) return `${label}: unknown kind ${JSON.stringify(c.kind)}.`;
  const kind = c.kind as PathKind;

  if (c.aggregate !== 'sum' && c.aggregate !== 'mean') return `${label}: aggregate must be sum or mean.`;
  const aggregate: Aggregate = c.aggregate;

  if (!Array.isArray(c.fields) || c.fields.length < 1 || c.fields.length > 2) return `${label}: needs 1 or 2 fields.`;
  if (!c.fields.every((f) => typeof f === 'string')) return `${label}: field names must be text.`;
  const fields = c.fields as string[];
  if (new Set(fields).size !== fields.length) return `${label}: the same field is listed twice.`;
  const cols = fields.map((n) => profile.columns.find((col) => col.name === n));
  const missingField = fields.find((_, i) => cols[i] === undefined);
  if (missingField !== undefined) return `${label}: no column named "${missingField}".`;
  const rule = chooseRule(cols.map((col) => col!.type));
  if (rule === null) return `${label}: no chart rule fits ${fields.join(' + ')}.`;
  // Never sum an average-only number (D-050): the total of every price means nothing.
  if (aggregate === 'sum' && usesAggregate(rule) && !canSum(cols as ColumnProfile[])) {
    const avg = cols.find((col) => col!.measure === 'average')!.name;
    return `${label}: sums ${avg}, which can only be averaged.`;
  }

  // Older replies (and some models) send one `filter`; accept it as a list of one.
  const rawFilters = Array.isArray(c.filters) ? c.filters : c.filter ? [c.filter] : [];
  if (rawFilters.length > MAX_FILTERS) return `${label}: more than ${MAX_FILTERS} filters.`;
  const filters: PathFilter[] = [];
  for (const raw of rawFilters) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const field = f.field;
    const rawValue = f.value;
    if (typeof field !== 'string' || typeof rawValue !== 'string') {
      return `${label}: each filter must have a field and a value.`;
    }
    const col = profile.columns.find((x) => x.name === field);
    if (!col) return `${label}: no column named "${field}" to filter on.`;
    if (col.type !== 'nominal') return `${label}: can only filter on a category column, not ${field}.`;
    // Filtering on a charted field would leave one bar or one line: nothing to compare.
    if (fields.includes(field)) return `${label}: filters on a field it also charts.`;
    if (filters.some((x) => x.field === field)) return `${label}: filters on ${field} twice.`;
    const value = rawValue.trim();
    if (filterRows(rows, [{ field, value }]).length === 0) return `${label}: "${value}" never occurs in ${field}.`;
    filters.push({ field, value });
  }
  if (filters.length > 1 && filterRows(rows, filters).length === 0) {
    return `${label}: no rows match ${describeFilters(filters, ' and ')}.`;
  }

  // Follow-ups stay inside their parent (D-051): they keep all its filters and add exactly
  // one, so a follow-up is always a narrower look at the parent's slice, never a repeat of
  // a top-level path. Top-level paths start with at most one filter.
  if (parent) {
    if (parent.filters.length >= MAX_FILTERS) return `${label}: the parent already has ${MAX_FILTERS} filters.`;
    if (!keepsFilters(filters, parent.filters) || filters.length !== parent.filters.length + 1) {
      return `${label}: a follow-up must keep the parent's filters and add one.`;
    }
  } else if (filters.length > 1) {
    return `${label}: a top-level path has at most one filter.`;
  }

  const draft: PathDraft = { question, kind, fields, aggregate, filters };
  if (parent && sameView(draft, parent, profile)) return `${label}: repeats its parent path.`;
  return draft;
}

/**
 * Gives drafts their ids and source. Ids come from position in the tree, so the same
 * branch always has the same ids, which is what the suggestion cache is keyed on.
 */
export function finishPaths(drafts: PathDraft[], sources: PathSource[], parent: Path | null): Path[] {
  return drafts.map((d, i) => ({
    ...toDraft(d),
    id: parent ? `${parent.id}.${i + 1}` : `p${i + 1}`,
    parent: parent?.id ?? null,
    source: sources[i],
  }));
}

import { aggregateValues, isMissing, parseNumber, type Row } from './aggregate';
import type { ColumnProfile, DataProfile } from './profile';
import type { Persona, Purpose } from './personas';
import { filterRows, type Path, type PathDraft, type PathFilter, type PathKind } from './paths';

// The rule-based fallback for Level 2: used when there's no API key, the AI call fails,
// or the AI's answer doesn't pass validation. It is deterministic (same data and persona,
// same paths), and every number it relies on is computed here from the rows.

/**
 * Which kinds of path come first for each purpose. The AI gets the same guidance in
 * words (api/suggest.ts); this is the version code can follow exactly.
 */
export const KIND_ORDER: Record<Purpose, PathKind[]> = {
  'deciding where to invest': ['comparison', 'outlier', 'trend', 'driver', 'distribution'],
  'reporting results upward': ['trend', 'comparison', 'outlier', 'distribution', 'driver'],
  'testing whether a pattern is real': ['driver', 'distribution', 'outlier', 'trend', 'comparison'],
  'finding problems to fix': ['outlier', 'trend', 'distribution', 'comparison', 'driver'],
  'just exploring': ['trend', 'comparison', 'distribution', 'outlier', 'driver'],
};

/**
 * Candidate paths in the persona's preferred order. They are NOT checked here: the caller
 * runs them through validatePaths, the same checks the AI's paths get, which drops repeats
 * of the parent and keeps one path per kind.
 */
export function ruleCandidates(profile: DataProfile, rows: Row[], persona: Persona, parent: Path | null): PathDraft[] {
  const byKind = parent ? followUps(profile, rows, parent) : candidatesInScope(profile, rows, null, undefined);
  return KIND_ORDER[persona.purpose].flatMap((kind) => byKind.get(kind) ?? []);
}

/**
 * Go-deeper fallback: narrow the parent to its top category value (e.g. Region = West,
 * the region with the most revenue), then look at that slice in other ways. A parent that
 * already has a filter keeps it, since a path holds one filter.
 */
function followUps(profile: DataProfile, rows: Row[], parent: Path): Map<PathKind, PathDraft> {
  const colsOf = (names: string[]) =>
    names.map((n) => profile.columns.find((c) => c.name === n)).filter((c): c is ColumnProfile => c !== undefined);
  const parentCols = colsOf(parent.fields);
  const measure = parentCols.find((c) => c.type === 'quantitative');

  let filter = parent.filter;
  if (!filter) {
    const split =
      parentCols.find((c) => c.type === 'nominal') ?? profile.columns.find((c) => c.type === 'nominal' && c.count > 0);
    const top = split ? topValue(rows, split.name, measure?.name) : null;
    filter = split && top !== null ? { field: split.name, value: top } : null;
  }
  return candidatesInScope(profile, rows, filter, measure?.name);
}

/**
 * The value of a category column with the largest total of a measure (or the most rows,
 * with no measure). Ties go to the alphabetically first value, so the result never
 * depends on row order.
 */
export function topValue(rows: Row[], field: string, measure: string | undefined): string | null {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (isMissing(r[field])) continue;
    const add = measure ? parseNumber(r[measure]) : 1;
    if (add === null) continue;
    const key = r[field].trim();
    totals.set(key, (totals.get(key) ?? 0) + add);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

/** One candidate per kind, for the rows a filter keeps (or all rows, with no filter). */
function candidatesInScope(
  profile: DataProfile,
  rows: Row[],
  filter: PathFilter | null,
  measureHint: string | undefined,
): Map<PathKind, PathDraft> {
  const usable = profile.columns.filter((c) => c.count > 0 && c.name !== filter?.field);
  const dates = usable.filter((c) => c.type === 'temporal');
  const categories = usable.filter((c) => c.type === 'nominal');
  const numbers = usable.filter((c) => c.type === 'quantitative');
  const measure = numbers.find((c) => c.name === measureHint) ?? numbers[0];
  const date = dates[0];
  const category = categories[0];
  const scope = filter ? ` for ${filter.value}` : '';
  const out = new Map<PathKind, PathDraft>();
  const add = (kind: PathKind, question: string, fields: string[], aggregate: 'sum' | 'mean' = 'sum') =>
    out.set(kind, { kind, question, fields, aggregate, filter });

  if (date && measure) add('trend', `How has ${measure.name} changed over time${scope}?`, [date.name, measure.name]);
  else if (date) add('trend', `How has the number of records changed${scope}?`, [date.name]);

  if (category && measure) add('comparison', `Which ${category.name} has the most ${measure.name}${scope}?`, [category.name, measure.name]);
  else if (category) add('comparison', `Which ${category.name} appears most often${scope}?`, [category.name]);

  if (measure) add('distribution', `How are ${measure.name} values spread${scope}?`, [measure.name]);

  const other = numbers.find((c) => c !== measure);
  if (measure && other) add('driver', `Does ${other.name} rise with ${measure.name}${scope}?`, [measure.name, other.name]);

  const standout = findStandout(filterRows(rows, filter), categories, numbers);
  if (standout) {
    const direction = standout.ratio > 0 ? 'high' : 'low';
    add('outlier', `Is ${standout.value} unusually ${direction} on ${standout.measure}${scope}?`, [standout.field, standout.measure], 'mean');
  }
  return out;
}

export interface Standout {
  field: string; // the category column, e.g. region
  value: string; // the group that stands out, e.g. West
  measure: string; // the number it stands out on, e.g. units
  mean: number; // that group's mean
  othersMean: number; // the mean of the other groups' means
  ratio: number; // (mean - othersMean) / othersMean: +0.3 means 30% above the rest
}

// Groups smaller than this are skipped: the mean of two rows is too noisy to call an outlier.
const MIN_GROUP_ROWS = 5;
const MIN_GROUPS = 3;
const MAX_GROUPS = 50;

/**
 * The category value that stands out most on some measure: for every category column and
 * every number column, compare each group's mean with the average of the other groups'
 * means, and keep the largest relative gap. Ties keep the first pair in column order.
 */
export function findStandout(rows: Row[], categories: ColumnProfile[], numbers: ColumnProfile[]): Standout | null {
  let best: Standout | null = null;
  for (const cat of categories) {
    for (const num of numbers) {
      const groups = new Map<string, number[]>();
      for (const r of rows) {
        const v = parseNumber(r[num.name]);
        if (isMissing(r[cat.name]) || v === null) continue;
        const key = r[cat.name].trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(v);
      }
      const means = [...groups.entries()]
        .filter(([, values]) => values.length >= MIN_GROUP_ROWS)
        .map(([value, values]) => ({ value, mean: aggregateValues(values, 'mean')! }))
        .sort((a, b) => a.value.localeCompare(b.value));
      if (means.length < MIN_GROUPS || means.length > MAX_GROUPS) continue;

      for (const g of means) {
        const others = means.filter((m) => m !== g);
        const othersMean = others.reduce((s, m) => s + m.mean, 0) / others.length;
        if (othersMean === 0) continue;
        const ratio = (g.mean - othersMean) / Math.abs(othersMean);
        if (!best || Math.abs(ratio) > Math.abs(best.ratio)) {
          best = { field: cat.name, value: g.value, measure: num.name, mean: g.mean, othersMean, ratio };
        }
      }
    }
  }
  return best;
}

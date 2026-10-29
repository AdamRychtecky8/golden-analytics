import { aggregateValues, isMissing, parseNumber, type Aggregate, type Row } from './aggregate';
import type { ColumnProfile, DataProfile } from './profile';
import type { Persona, Purpose } from './personas';
import { MAX_FILTERS, filterRows, type Path, type PathDraft, type PathFilter, type PathKind } from './paths';

// The rule-based fallback for Level 2: used when there's no API key, the AI call fails,
// or the AI's answer doesn't pass validation. It is deterministic (same data and persona,
// same paths), and every number it relies on is computed here from the rows.

/**
 * Which kinds of path come first for each purpose. The AI gets the same guidance in
 * words (api/suggest.ts); this is the version code can follow exactly.
 */
const READABLE_GROUPS = 12;

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
  const byKind = parent ? followUps(profile, rows, parent) : candidatesInScope(profile, rows, [], undefined);
  return KIND_ORDER[persona.purpose].flatMap((kind) => byKind.get(kind) ?? []);
}

/**
 * Go-deeper fallback: stay inside the parent's slice and narrow it by one more filter
 * (D-051). The new filter is the parent's top value in a category it doesn't filter yet,
 * preferring the category it charts: "Which genre has the most revenue?" goes deeper into
 * genre = Fiction (the top genre), then looks at Fiction in other ways. A parent with
 * MAX_FILTERS filters has no follow-ups.
 */
function followUps(profile: DataProfile, rows: Row[], parent: Path): Map<PathKind, PathDraft> {
  if (parent.filters.length >= MAX_FILTERS) return new Map();
  const parentCols = parent.fields
    .map((n) => profile.columns.find((c) => c.name === n))
    .filter((c): c is ColumnProfile => c !== undefined);
  const measure = parentCols.find((c) => c.type === 'quantitative');
  const free = (c: ColumnProfile) => c.type === 'nominal' && c.count > 0 && !parent.filters.some((f) => f.field === c.name);
  const others = profile.columns.filter(free);
  const split = parentCols.find(free) ?? others.find((c) => c.distinct <= READABLE_GROUPS) ?? others[0];
  if (!split) return new Map(); // every category is already filtered: nothing left to narrow by

  const slice = filterRows(rows, parent.filters);
  // Rank by the parent's measure only if a sum of it means something; otherwise by count.
  const rankBy = measure?.measure === 'additive' ? measure.name : undefined;
  const top = topValue(slice, split.name, rankBy);
  if (top === null) return new Map();
  return candidatesInScope(profile, rows, [...parent.filters, { field: split.name, value: top }], measure?.name);
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

/** One candidate per kind, for the rows the filters keep (or all rows, with none). */
function candidatesInScope(
  profile: DataProfile,
  rows: Row[],
  filters: PathFilter[],
  measureHint: string | undefined,
): Map<PathKind, PathDraft> {
  const usable = profile.columns.filter((c) => c.count > 0 && !filters.some((f) => f.field === c.name));
  const dates = usable.filter((c) => c.type === 'temporal');
  // Categories with a readable number of groups come first (the AI gets the same advice):
  // 56 titles make a crowded chart, 6 formats don't. Column order breaks ties.
  const readable = (c: ColumnProfile) => c.distinct >= 2 && c.distinct <= READABLE_GROUPS;
  const nominals = usable.filter((c) => c.type === 'nominal');
  const categories = [...nominals.filter(readable), ...nominals.filter((c) => !readable(c))];
  const numbers = usable.filter((c) => c.type === 'quantitative');
  // Prefer the parent's number, then the first additive one (revenue over price, D-050).
  // With no additive number, totals come from counting records instead.
  const measure = numbers.find((c) => c.name === measureHint) ?? numbers.find((c) => c.measure === 'additive');
  const additive = measure?.measure === 'additive';
  const how: Aggregate = additive ? 'sum' : 'mean';
  const of = measure ? (additive ? measure.name : `average ${measure.name}`) : '';
  const date = dates[0];
  const category = categories[0];
  const scope = filters.length > 0 ? ` for ${filters.map((f) => f.value).join(', ')}` : '';
  const out = new Map<PathKind, PathDraft>();
  const add = (kind: PathKind, question: string, fields: string[], aggregate: Aggregate = how) =>
    out.set(kind, { kind, question, fields, aggregate, filters });

  if (date && measure) add('trend', `How has ${of} changed over time${scope}?`, [date.name, measure.name]);
  else if (date) add('trend', `How has the number of records changed${scope}?`, [date.name]);

  if (category && measure && additive) add('comparison', `Which ${category.name} has the most ${of}${scope}?`, [category.name, measure.name]);
  else if (category && measure) add('comparison', `Which ${category.name} has the highest ${of}${scope}?`, [category.name, measure.name]);
  else if (category) add('comparison', `Which ${category.name} has the most records${scope}?`, [category.name]);

  const spread = measure ?? numbers[0];
  if (spread) add('distribution', `How are ${spread.name} values spread${scope}?`, [spread.name]);

  const other = numbers.find((c) => c !== spread);
  if (spread && other) add('driver', `Does ${other.name} rise with ${spread.name}${scope}?`, [spread.name, other.name]);

  const standout = findStandout(filterRows(rows, filters), categories, numbers);
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

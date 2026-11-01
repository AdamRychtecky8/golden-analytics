import type { AskResult } from './ask';
import type { ChartView, PathFilter } from './paths';

// The evaluation set's shape and how a result is compared with what a case expects. Used by
// the unit tests (with each case's faked AI reply) and by npm run eval:ask (with the model).

/** One answer a case counts as right. candidates: a clarify's charts, in any order. */
export interface Expectation {
  outcome: string | string[];
  category?: string | string[];
  spec?: ChartView;
  candidates?: ChartView[];
}

export interface AskCase {
  id: string;
  prompt: string;
  scope?: PathFilter[];
  fakeOnly?: boolean; // a deliberately wrong AI reply: unit tests only
  expect: Expectation;
  accept?: Expectation[]; // other answers that are also right, where the question honestly allows them (Adam decides)
  fake: unknown;
}

const oneOf = (want: string | string[] | undefined, got: string | null | undefined) => want === undefined || (Array.isArray(want) ? want : [want]).includes(got ?? '');
const filterKey = (fs: PathFilter[]) => fs.map((f) => `${f.field}=${f.value}`).sort().join('|');

/** Same chart: the same fields in any order, the same aggregate, the same filters in any order. */
export function sameSpec(a: ChartView, b: ChartView): boolean {
  return [...a.fields].sort().join('|') === [...b.fields].sort().join('|') && (a.aggregate ?? 'sum') === (b.aggregate ?? 'sum') && filterKey(a.filters) === filterKey(b.filters);
}

/** Why a result misses one expectation, or null when it matches. */
function missOne(e: Expectation, r: AskResult): string | null {
  if (!oneOf(e.outcome, r.kind)) return `outcome ${r.kind}, expected ${JSON.stringify(e.outcome)}`;
  const category = 'category' in r ? r.category : null;
  if (!oneOf(e.category, category)) return `category ${category}, expected ${JSON.stringify(e.category)}`;
  if (e.spec) {
    const spec = r.kind === 'clarify' ? null : r.spec;
    if (!spec || !sameSpec(spec, e.spec)) return `chart ${JSON.stringify(spec)}, expected ${JSON.stringify(e.spec)}`;
  }
  if (e.candidates) {
    const got = r.kind === 'clarify' ? r.candidates : [];
    const same = got.length === e.candidates.length && e.candidates.every((want) => got.some((g) => sameSpec(g, want)));
    if (!same) return `candidates ${JSON.stringify(got)}, expected ${JSON.stringify(e.candidates)}`;
  }
  return null;
}

/** Why a result misses its case (the main expectation's reason), or null when any accepted answer matches. */
export function missReason(c: AskCase, r: AskResult): string | null {
  const main = missOne(c.expect, r);
  if (main === null || (c.accept ?? []).some((e) => missOne(e, r) === null)) return null;
  return c.accept?.length ? `${main} (or one of ${c.accept.length} other accepted answers)` : main;
}

import type { AskResult } from './ask';
import type { ChartView, PathFilter } from './paths';

// The evaluation set's shape and how a result is compared with what a case expects. Used by
// the unit tests (with each case's faked AI reply) and by npm run eval:ask (with the model).

export interface AskCase {
  id: string;
  prompt: string;
  scope?: PathFilter[];
  fakeOnly?: boolean; // a deliberately wrong AI reply: unit tests only
  expect: { outcome: string | string[]; category?: string | string[]; spec?: ChartView };
  fake: unknown;
}

const oneOf = (want: string | string[] | undefined, got: string | null | undefined) => want === undefined || (Array.isArray(want) ? want : [want]).includes(got ?? '');
const filterKey = (fs: PathFilter[]) => fs.map((f) => `${f.field}=${f.value}`).sort().join('|');

/** Same chart: the same fields in any order, the same aggregate, the same filters in any order. */
export function sameSpec(a: ChartView, b: ChartView): boolean {
  return [...a.fields].sort().join('|') === [...b.fields].sort().join('|') && (a.aggregate ?? 'sum') === (b.aggregate ?? 'sum') && filterKey(a.filters) === filterKey(b.filters);
}

/** Why a result misses its case, or null when it matches. */
export function missReason(c: AskCase, r: AskResult): string | null {
  if (!oneOf(c.expect.outcome, r.kind)) return `outcome ${r.kind}, expected ${JSON.stringify(c.expect.outcome)}`;
  const category = 'category' in r ? r.category : null;
  if (!oneOf(c.expect.category, category)) return `category ${category}, expected ${JSON.stringify(c.expect.category)}`;
  if (c.expect.spec) {
    const spec = r.kind === 'clarify' ? null : r.spec;
    if (!spec || !sameSpec(spec, c.expect.spec)) return `chart ${JSON.stringify(spec)}, expected ${JSON.stringify(c.expect.spec)}`;
  }
  return null;
}

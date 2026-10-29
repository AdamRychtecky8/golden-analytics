import type { Row } from './aggregate';
import { groupView, periodLabel, type Group, type Grouping } from './groups';
import type { ChartView } from './paths';
import type { DataProfile } from './profile';

// "Is this really an insight?" checks. Code runs them on every path's chart and shows
// any that apply as a quiet note, labeled as a check (never as AI). They catch the three
// most common ways a ranking misleads: a few expensive items outranking many cheap ones,
// a group too small to trust, and one group dwarfing the rest. Level 3 reads them as facts.

// Price/mix: a money ranking "differs meaningfully" from the count ranking when the #1
// changes, or when any of the top groups moves this many places or more. One place is
// common noise between close groups; two places means price changed the story.
export const MIX_RANK_SHIFT = 2;
const MIX_TOP_GROUPS = 5; // only the groups a reader looks at; tail reshuffles don't matter

// Small group: below about 30 records, a group's mean or share can swing a lot with a few
// more records (the usual rule of thumb for when an average starts to settle).
export const SMALL_GROUP = 30;

// Concentration: when one group holds 40% or more of the total, the chart is mostly about
// that group, and "the rest" may deserve its own look.
export const CONCENTRATION = 0.4;

// Words that mark a number as money, so a ranking by it can be compared to a ranking by count.
const MONEY_WORDS = ['revenue', 'sales', 'amount', 'cost', 'costs', 'spend', 'spending', 'profit', 'income', 'price', 'value'];

export type CheckId = 'mix' | 'small' | 'concentration';

export interface Check {
  id: CheckId;
  text: string; // one line, with its numbers, computed here
  countView?: ChartView; // price/mix only: the same comparison by count
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function isMoney(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => MONEY_WORDS.includes(w));
}

/** Every check that applies to a view's chart, in a fixed order. */
export function runChecks(view: ChartView, profile: DataProfile, rows: Row[]): Check[] {
  const g = groupView(view, profile, rows);
  if (!g || g.groups.length === 0) return [];
  return [mixCheck(g, view), smallCheck(g), concentrationCheck(g)].filter((c): c is Check => c !== null);
}

function mixCheck(g: Grouping, view: ChartView): Check | null {
  // Only for categories ranked by a sum of money: that's where a few expensive items can
  // outrank many cheap ones.
  if (g.by !== 'category' || g.aggregate !== 'sum' || !g.measure || !isMoney(g.measure.name) || g.groups.length < 2) return null;
  const byValue = g.groups; // already largest value first
  const byCount = [...g.groups].sort((a, b) => b.records - a.records || a.label.localeCompare(b.label));
  const countRank = new Map(byCount.map((x, i) => [x.label, i + 1]));
  const countView: ChartView = { fields: [g.field.name], aggregate: 'sum', filters: view.filters };
  const m = g.measure.name;

  if (byValue[0].label !== byCount[0].label) {
    const [top, most] = [byValue[0], byCount[0]];
    return {
      id: 'mix',
      text: `${top.label} ranks first by ${m}, but ${most.label} has the most records (${num.format(most.records)} vs ${num.format(top.records)}): price, not volume, puts ${top.label} on top.`,
      countView,
    };
  }
  const mover = byValue
    .slice(0, MIX_TOP_GROUPS)
    .map((x, i) => ({ group: x, valueRank: i + 1, countRank: countRank.get(x.label)! }))
    .filter((x) => Math.abs(x.valueRank - x.countRank) >= MIX_RANK_SHIFT)
    .sort((a, b) => Math.abs(b.valueRank - b.countRank) - Math.abs(a.valueRank - a.countRank))[0];
  if (!mover) return null;
  const higher = mover.valueRank < mover.countRank;
  return {
    id: 'mix',
    text: `${mover.group.label} ranks ${ordinal(mover.valueRank)} by ${m} but ${ordinal(mover.countRank)} by records: ${higher ? 'higher' : 'lower'} prices, not volume, move it.`,
    countView,
  };
}

function smallCheck(g: Grouping): Check | null {
  // Empty periods are already shown as zeros (D-024); only groups that have records count.
  const small = g.groups.filter((x) => x.records > 0 && x.records < SMALL_GROUP);
  if (small.length === 0) return null;
  const name = (x: Group) => (g.by === 'period' ? periodLabel(x.label, g.timeUnit!) : x.label);
  const smallest = [...small].sort((a, b) => a.records - b.records)[0];
  const what = g.by === 'period' ? `${g.timeUnit}s` : 'groups';
  const text =
    small.length === 1
      ? `${name(smallest)} has only ${smallest.records} records, too few to compare reliably (under ${SMALL_GROUP}).`
      : `${small.length} ${what} have fewer than ${SMALL_GROUP} records (smallest: ${name(smallest)}, ${smallest.records}), too few to compare reliably.`;
  return { id: 'small', text };
}

function concentrationCheck(g: Grouping): Check | null {
  // Shares need a total that is the sum of its parts, so means are skipped, and periods
  // too: a share of time is rarely the question.
  if (g.by !== 'category' || g.total === null || g.total <= 0 || g.groups.length < 2) return null;
  const top = g.groups[0];
  const share = (top.value ?? 0) / g.total;
  if (share < CONCENTRATION) return null;
  const of = g.measure ? g.measure.name : 'all records';
  return { id: 'concentration', text: `${top.label} holds ${pct(share)} of ${of}, so this chart is mostly about one group.` };
}

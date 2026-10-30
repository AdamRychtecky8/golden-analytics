import { isMissing, parseNumber, type Row } from './aggregate';
import { groupView, periodLabel, type Group, type Grouping } from './groups';
import type { ChartView } from './paths';
import type { DataProfile } from './profile';
import { roleOf, UNKNOWN_ROLES, type Roles } from './roles';

// "Is this really an insight?" checks. Code runs them on every chart and returns any that
// apply as findings, labeled as a check (never as AI). They catch the common ways a ranking
// misleads: a few expensive items outranking many cheap ones, a group too small to trust,
// one group dwarfing the rest, and a group whose lead is really one author or title.
// Level 3 reads them as facts.
//
// Each check is registered with its preconditions and a run function. A check whose
// preconditions aren't met is skipped with a reason; the reasons are for tests and logs,
// never shown to the user.

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

// Driven by one entity: when a single entity (an author, a title) holds half or more of the
// top group, the group's figure is mostly that one entity's. Half is the line where "mostly"
// is literally true, so the caveat needs no further justification to a reader. (Below it,
// on Bookshop: count by format, where one author is 30% of the top group.)
export const ENTITY_SHARE = 0.5;

// Words that mark a number as money, so a ranking by it can be compared to a ranking by
// count. Only used when the data has no roles file; with roles, the "money" role decides.
const MONEY_WORDS = ['revenue', 'sales', 'amount', 'cost', 'costs', 'spend', 'spending', 'profit', 'income', 'price', 'value'];

export type CheckId = 'mix' | 'small' | 'concentration' | 'entity';

// Misleading: the naive reading of the chart is wrong. Caveat: true, but worth saying.
export type Severity = 'misleading' | 'caveat';

/** A group's place by the chart's value and by its record count (1 = first). */
export interface RankedGroup {
  label: string;
  valueRank: number;
  countRank: number;
  records: number;
}

export interface LabeledCount {
  label: string; // as the chart shows it: "Hardcover", or "Mar 2193" for a period
  records: number;
}

// The numbers behind each finding, so later phases can phrase it from facts and slots.
export type Evidence =
  | { check: 'mix'; measure: string; groups: RankedGroup[] } // #1 change: the #1 by value, then the #1 by count
  | { check: 'small'; threshold: number; small: LabeledCount[]; smallest: LabeledCount; top: LabeledCount; topIsSmall: boolean }
  | { check: 'concentration'; measure: string | null; group: string; value: number; total: number; share: number; threshold: number }
  | {
      check: 'entity';
      measure: string | null; // null: the chart counts records
      group: string; // the chart's top group
      groupValue: number;
      column: string; // the entity column, e.g. "author"
      entity: string; // e.g. "Bianca Thompson"
      entityValue: number; // the entity's part of the group's value
      share: number; // entityValue / groupValue
      rankWithout: number; // the group's rank once the entity's rows are removed everywhere
      threshold: number;
    };

export interface Finding {
  id: CheckId;
  severity: Severity;
  text: string; // one line, with its numbers, computed here
  evidence: Evidence;
  countView?: ChartView; // price/mix only: the same comparison by count
}

export interface Skipped {
  id: CheckId;
  reason: string;
}

export interface CheckRun {
  findings: Finding[];
  skipped: Skipped[];
}

/** What every check gets: the chart, the data, its roles, and the chart's groups. */
interface CheckContext {
  view: ChartView;
  profile: DataProfile;
  roles: Roles;
  g: Grouping;
}

interface CheckDef {
  id: CheckId;
  preconditions: (ctx: CheckContext) => string | null; // a reason to skip, or null to run
  run: (ctx: CheckContext) => Finding | null; // null: it ran and found nothing
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function isMoney(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => MONEY_WORDS.includes(w));
}

/** Money by the "money" role when roles are known; by the name guess when they aren't. */
function measureIsMoney(name: string, roles: Roles): boolean {
  return roles.known ? roleOf(roles, name) === 'money' : isMoney(name);
}

const mix: CheckDef = {
  id: 'mix',
  // Only for categories ranked by a sum of money: that's where a few expensive items can
  // outrank many cheap ones.
  preconditions: ({ g, roles }) => {
    if (g.by !== 'category') return 'groups are periods, not categories';
    if (g.aggregate !== 'sum' || !g.measure) return `the chart is a ${g.aggregate}, not a sum`;
    if (!measureIsMoney(g.measure.name, roles)) {
      return roles.known ? `"${g.measure.name}" doesn't have the money role` : `"${g.measure.name}" doesn't look like money by name`;
    }
    if (g.groups.length < 2) return 'fewer than 2 groups';
    return null;
  },
  run: ({ g, view }) => {
    const byValue = g.groups; // already largest value first
    const byCount = [...g.groups].sort((a, b) => b.records - a.records || a.label.localeCompare(b.label));
    const countRank = new Map(byCount.map((x, i) => [x.label, i + 1]));
    const ranked = (x: Group, valueRank: number): RankedGroup => ({ label: x.label, valueRank, countRank: countRank.get(x.label)!, records: x.records });
    const countView: ChartView = { fields: [g.field.name], aggregate: 'sum', filters: view.filters };
    const m = g.measure!.name;

    if (byValue[0].label !== byCount[0].label) {
      // The #1 changes: the chart's leader is not the leader by volume.
      const [top, most] = [byValue[0], byCount[0]];
      return {
        id: 'mix',
        severity: 'misleading',
        text: `${top.label} ranks first by ${m}, but ${most.label} has the most records (${num.format(most.records)} vs ${num.format(top.records)}): price, not volume, puts ${top.label} on top.`,
        evidence: { check: 'mix', measure: m, groups: [ranked(top, 1), ranked(most, byValue.indexOf(most) + 1)] },
        countView,
      };
    }
    const mover = byValue
      .slice(0, MIX_TOP_GROUPS)
      .map((x, i) => ranked(x, i + 1))
      .filter((x) => Math.abs(x.valueRank - x.countRank) >= MIX_RANK_SHIFT)
      .sort((a, b) => Math.abs(b.valueRank - b.countRank) - Math.abs(a.valueRank - a.countRank))[0];
    if (!mover) return null;
    // Only a lower group moves: the #1 holds, so the chart's headline is still true.
    const higher = mover.valueRank < mover.countRank;
    return {
      id: 'mix',
      severity: 'caveat',
      text: `${mover.label} ranks ${ordinal(mover.valueRank)} by ${m} but ${ordinal(mover.countRank)} by records: ${higher ? 'higher' : 'lower'} prices, not volume, move it.`,
      evidence: { check: 'mix', measure: m, groups: [mover] },
      countView,
    };
  },
};

const small: CheckDef = {
  id: 'small',
  preconditions: () => null, // any list of groups can have a group too small to trust
  run: ({ g }) => {
    // Empty periods are already shown as zeros (D-024); only groups that have records count.
    const smallGroups = g.groups.filter((x) => x.records > 0 && x.records < SMALL_GROUP);
    if (smallGroups.length === 0) return null;
    const name = (x: Group) => (g.by === 'period' ? periodLabel(x.label, g.timeUnit!) : x.label);
    const labeled = (x: Group): LabeledCount => ({ label: name(x), records: x.records });
    const smallest = [...smallGroups].sort((a, b) => a.records - b.records)[0];
    // "Ranked first": categories are already largest first; periods are in time order, so
    // the first is the highest-value period (the earliest, on a tie).
    const top = g.by === 'category' ? g.groups[0] : g.groups.reduce((best, x) => ((x.value ?? 0) > (best.value ?? 0) ? x : best));
    const topIsSmall = smallGroups.includes(top);
    const what = g.by === 'period' ? `${g.timeUnit}s` : 'groups';
    const text =
      smallGroups.length === 1
        ? `${name(smallest)} has only ${smallest.records} records, too few to compare reliably (under ${SMALL_GROUP}).`
        : `${smallGroups.length} ${what} have fewer than ${SMALL_GROUP} records (smallest: ${name(smallest)}, ${smallest.records}), too few to compare reliably.`;
    return {
      id: 'small',
      // A small group at the top is the chart's headline resting on too few records.
      severity: topIsSmall ? 'misleading' : 'caveat',
      text,
      evidence: { check: 'small', threshold: SMALL_GROUP, small: smallGroups.map(labeled), smallest: labeled(smallest), top: labeled(top), topIsSmall },
    };
  },
};

const concentration: CheckDef = {
  id: 'concentration',
  // Shares need a total that is the sum of its parts, so means are skipped, and periods
  // too: a share of time is rarely the question.
  preconditions: ({ g }) => {
    if (g.by !== 'category') return 'groups are periods, not categories';
    if (g.total === null) return 'the chart is a mean, which has no total to take a share of';
    if (g.total <= 0) return 'the total is zero or less';
    if (g.groups.length < 2) return 'fewer than 2 groups';
    return null;
  },
  run: ({ g }) => {
    const top = g.groups[0];
    const value = top.value ?? 0;
    const share = value / g.total!;
    if (share < CONCENTRATION) return null;
    const of = g.measure ? g.measure.name : 'all records';
    return {
      id: 'concentration',
      severity: 'caveat', // true of the data as charted; worth saying, not wrong
      text: `${top.label} holds ${pct(share)} of ${of}, so this chart is mostly about one group.`,
      evidence: { check: 'concentration', measure: g.measure?.name ?? null, group: top.label, value, total: g.total!, share, threshold: CONCENTRATION },
    };
  },
};

/** Entity columns the check can use for this chart, and those it must leave out. */
function entityColumns({ g, roles }: CheckContext): { usable: string[]; determined: string[] } {
  if (!roles.known) return { usable: [], determined: [] };
  const candidates = Object.keys(roles.byColumn).filter((c) => roles.byColumn[c] === 'entity' && c !== g.field.name);
  const usable: string[] = [];
  const determined: string[] = [];
  for (const column of candidates) {
    // If every group has only one value of this column (a title has one author), the chart
    // field already determines it: the entity always holds its whole group, so "driven by
    // one entity" would be true of every chart and say nothing.
    const seen = new Map<string, string>();
    let varies = false;
    for (const r of g.rows) {
      if (isMissing(r[column])) continue;
      const group = r[g.field.name].trim();
      const e = r[column].trim();
      if (!seen.has(group)) seen.set(group, e);
      else if (seen.get(group) !== e) {
        varies = true;
        break;
      }
    }
    (varies ? usable : determined).push(column);
  }
  return { usable, determined };
}

const entity: CheckDef = {
  id: 'entity',
  // Only for categories summed or counted: a share of a mean means nothing.
  preconditions: (ctx) => {
    const { g, roles } = ctx;
    if (!roles.known) return 'roles are unknown (no roles file), so no column is known to be an entity';
    if (g.by !== 'category') return 'groups are periods, not categories';
    if (g.total === null) return 'the chart is a mean, which has no total to take a share of';
    if ((g.groups[0].value ?? 0) <= 0) return "the top group's value is zero or less";
    const { usable, determined } = entityColumns(ctx);
    if (usable.length > 0) return null;
    if (determined.length === 0) return `no column besides "${g.field.name}" has the entity role`;
    return `"${g.field.name}" determines ${determined.map((c) => `"${c}"`).join(', ')} (one per group), so one entity always holds its whole group`;
  },
  run: (ctx) => {
    const { g } = ctx;
    const top = g.groups[0];
    const field = g.field.name;
    const valueOf = (r: Row) => (g.measure ? parseNumber(r[g.measure.name])! : 1);

    // The single entity, across every usable entity column, with the largest part of the
    // top group's value. Ties go to the earlier column, then the name first alphabetically.
    let best: { column: string; entity: string; value: number } | null = null;
    for (const column of entityColumns(ctx).usable) {
      const parts = new Map<string, number>();
      for (const r of g.rows) {
        if (r[field].trim() !== top.label || isMissing(r[column])) continue;
        const e = r[column].trim();
        parts.set(e, (parts.get(e) ?? 0) + valueOf(r));
      }
      for (const [e, v] of [...parts].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (best === null || v > best.value) best = { column, entity: e, value: v };
      }
    }
    if (best === null) return null;

    // Remove the entity's rows everywhere in the chart, then rank the groups again (same
    // order as the chart: largest first, then by name). A group left with no rows counts as 0.
    const without = new Map(g.groups.map((x) => [x.label, 0]));
    for (const r of g.rows) {
      if (!isMissing(r[best.column]) && r[best.column].trim() === best.entity) continue;
      const k = r[field].trim();
      without.set(k, without.get(k)! + valueOf(r));
    }
    const order = [...without].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const rankWithout = order.findIndex(([label]) => label === top.label) + 1;

    const groupValue = top.value!;
    const share = best.value / groupValue;
    const m = g.measure ? g.measure.name : 'records';
    const misleading = rankWithout > 1;
    if (!misleading && share < ENTITY_SHARE) return null;
    const evidence: Evidence = {
      check: 'entity',
      measure: g.measure?.name ?? null,
      group: top.label,
      groupValue,
      column: best.column,
      entity: best.entity,
      entityValue: best.value,
      share,
      rankWithout,
      threshold: ENTITY_SHARE,
    };
    const said = `${best.entity} accounts for ${pct(share)} of ${m} in ${top.label}.`;
    return misleading
      ? // The chart's #1 is only #1 because of one entity.
        { id: 'entity', severity: 'misleading', text: `${said} Without that ${best.column}, ${top.label} ranks ${ordinal(rankWithout)}.`, evidence }
      : { id: 'entity', severity: 'caveat', text: said, evidence };
  },
};

/** Every check, in the order findings are listed. */
const CHECKS: CheckDef[] = [mix, small, concentration, entity];

const skipAll = (reason: string): CheckRun => ({ findings: [], skipped: CHECKS.map((c) => ({ id: c.id, reason })) });

/**
 * Runs every check on a view's chart. Roles default to unknown (an uploaded CSV); checks
 * that need a role then skip. Columns with the "id" role are never scanned.
 */
export function runChecks(view: ChartView, profile: DataProfile, rows: Row[], roles: Roles = UNKNOWN_ROLES): CheckRun {
  const idField = view.fields.find((f) => roleOf(roles, f) === 'id');
  if (idField) return skipAll(`"${idField}" has the id role: ids are counted, never checked`);
  const g = groupView(view, profile, rows);
  if (!g) return skipAll('this chart has no single list of groups (scatter, histogram, or heatmap)');
  if (g.groups.length === 0) return skipAll('the chart has no groups');

  const ctx: CheckContext = { view, profile, roles, g };
  const run: CheckRun = { findings: [], skipped: [] };
  for (const check of CHECKS) {
    const reason = check.preconditions(ctx);
    if (reason !== null) {
      run.skipped.push({ id: check.id, reason });
      continue;
    }
    const finding = check.run(ctx);
    if (finding) run.findings.push(finding);
  }
  return run;
}

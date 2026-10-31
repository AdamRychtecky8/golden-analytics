import { isMissing, parseNumber, type Row } from './aggregate';
import { chooseRule, effectiveAggregate } from './chartRules';
import { groupView, periodLabel } from './groups';
import { filterRows, type ChartView } from './paths';
import type { ColumnProfile, DataProfile } from './profile';
import { currencyOf, groupLabel, roleOf, rowNounOf, UNKNOWN_ROLES, withRoleMeasures, type Roles } from './roles';

// Facts: the numbers a card may use, computed in code from the same rows as the chart.
// Card text is written as templates with slots like {top_share}, and code fills each slot
// from this list (card.ts), so every number on a card is one of these, traceable to how it
// was computed. The AI, when it rephrases, may only use the same slots (D-052).

export interface Fact {
  id: string; // the slot name: top_item, top_share, change_pct, ...
  label: string; // what it means, for the AI and for the "facts used" list
  display: string; // the formatted value that goes into the text: "Hardcover", "38%", "+12%"
  value?: number; // the unformatted number, for facts that are numbers (0.377 for "38%")
}

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const twoPlaces = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Big totals as whole numbers (261,964); small values and means with cents (13.59). */
const amount = (x: number, mean: boolean) => (mean || Math.abs(x) < 100 ? twoPlaces.format(x) : whole.format(x));
const percent = (x: number) => `${Math.round(x * 100)}%`;
export const percentText = percent;
const signedPercent = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/**
 * Every fact code can state about a view's chart. Charts that compare nothing give only the
 * basics. With roles, a count is in the row noun ("items sold"), a yes/no group reads
 * "award winner: no", and a money amount carries the currency, or reads "261,964 in revenue"
 * without one (the *_amount facts).
 */
export function computeFacts(view: ChartView, profile: DataProfile, rows: Row[], roles: Roles = UNKNOWN_ROLES): Fact[] {
  profile = withRoleMeasures(profile, roles);
  const facts: Fact[] = [];
  const add = (id: string, label: string, display: string, value?: number) =>
    facts.push(value === undefined ? { id, label, display } : { id, label, display, value });
  const cols = view.fields.map((n) => profile.columns.find((c) => c.name === n)).filter((c): c is ColumnProfile => !!c);
  if (cols.length !== view.fields.length) return facts;
  const rule = chooseRule(cols.map((c) => c.type));
  const subset = filterRows(rows, view.filters).filter((r) => cols.every((c) => !isMissing(r[c.name])));

  add('record_count', 'records in the chart', whole.format(subset.length));
  if (view.filters.length > 0) add('scope', 'the slice the chart looks at', view.filters.map((f) => f.value).join(', '));

  const g = groupView(view, profile, rows);
  if (g && g.groups.length > 0) {
    const mean = g.aggregate === 'mean';
    const many = rowNounOf(roles).many;
    const measure = g.measure ? (mean ? `average ${g.measure.name}` : g.measure.name) : many;
    add('measure', 'what is compared', measure);
    const fmt = (x: number | null) => (x === null ? 'no value' : g.measure ? amount(x, mean) : whole.format(x));
    // An amount that says what it is: "$261,964", "261,964 in revenue", or "26,881 items sold".
    const currency = g.measure && roleOf(roles, g.measure.name) === 'money' ? currencyOf(roles) : null;
    const amountText = (x: number | null) =>
      x === null ? 'no value' : !g.measure ? `${fmt(x)} ${many}` : currency ? `${currency}${fmt(x)}` : `${fmt(x)} in ${measure}`;
    // A yes/no group can't stand alone as a subject ("no holds 53%"): see groupLabel.
    const label = (x: string) => groupLabel(roles, g.field.name, x);

    if (g.by === 'category') {
      const [top, second] = g.groups;
      const bottom = g.groups[g.groups.length - 1];
      add('group_field', 'what the groups are', g.field.name);
      add('group_count', 'number of groups', whole.format(g.groups.length));
      add('top_item', 'the group with the highest value', label(top.label));
      add('top_value', `${top.label}'s ${measure}`, fmt(top.value));
      add('top_amount', `${top.label}'s ${measure}, with its unit`, amountText(top.value));
      add('top_records', `records in ${top.label}`, whole.format(top.records));
      if (g.total !== null && g.total > 0 && top.value !== null) add('top_share', `${top.label}'s share of all ${measure}`, percent(top.value / g.total), top.value / g.total);
      if (g.total !== null) add('total', `total ${measure}`, fmt(g.total));
      if (second) {
        add('second_item', 'the group in second place', label(second.label));
        add('second_value', `${second.label}'s ${measure}`, fmt(second.value));
        add('second_amount', `${second.label}'s ${measure}, with its unit`, amountText(second.value));
        if (top.value !== null && second.value !== null) {
          add('gap_to_second', `how far ${top.label} is ahead of ${second.label}`, fmt(top.value - second.value));
          if (second.value > 0) add('gap_pct', `how much more ${top.label} has than ${second.label}`, percent(top.value / second.value - 1), top.value / second.value - 1);
        }
      }
      if (bottom !== top) {
        add('bottom_item', 'the group with the lowest value', label(bottom.label));
        add('bottom_value', `${bottom.label}'s ${measure}`, fmt(bottom.value));
      }
    } else {
      const unit = g.timeUnit!;
      // Periods with a value (a mean has none for an empty period).
      const valued = g.groups.filter((p) => p.value !== null);
      if (valued.length >= 2) {
        const first = valued[0];
        const last = valued[valued.length - 1];
        const peak = valued.reduce((a, b) => (b.value! > a.value! ? b : a));
        const low = valued.reduce((a, b) => (b.value! < a.value! ? b : a));
        const change = last.value! - first.value!;
        add('first_period', 'the first period', periodLabel(first.label, unit));
        add('last_period', 'the last period', periodLabel(last.label, unit));
        add('first_value', `${measure} in the first period`, fmt(first.value));
        add('last_value', `${measure} in the last period`, fmt(last.value));
        add('change', 'last period minus first period', `${change > 0 ? '+' : change < 0 ? '−' : ''}${fmt(Math.abs(change))}`);
        if (first.value! !== 0) add('change_pct', 'change from first to last period', signedPercent(change / Math.abs(first.value!)), change / Math.abs(first.value!));
        add('direction', 'whether it went up or down', change > 0 ? 'rose' : change < 0 ? 'fell' : 'held steady');
        add('peak_period', 'the period with the highest value', periodLabel(peak.label, unit));
        add('peak_value', `${measure} in the peak period`, fmt(peak.value));
        add('peak_amount', `${measure} in the peak period, with its unit`, amountText(peak.value));
        add('low_period', 'the period with the lowest value', periodLabel(low.label, unit));
        add('low_value', `${measure} in the lowest period`, fmt(low.value));
        add('low_amount', `${measure} in the lowest period, with its unit`, amountText(low.value));
        add('period_count', `number of ${unit}s`, whole.format(g.groups.length));
      }
    }
  } else if (rule === 'histogram') {
    const [num] = cols;
    const values = subset.map((r) => parseNumber(r[num.name])!).sort((a, b) => a - b);
    if (values.length > 0) {
      const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * (values.length - 1)))];
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      add('measure', 'the number shown', num.name);
      add('min_value', `lowest ${num.name}`, amount(values[0], true));
      add('max_value', `highest ${num.name}`, amount(values[values.length - 1], true));
      add('median_value', `median ${num.name}`, amount(q(0.5), true));
      add('mean_value', `mean ${num.name}`, amount(mean, true));
      add('p25', `${num.name} below which a quarter of records fall`, amount(q(0.25), true));
      add('p75', `${num.name} below which three quarters of records fall`, amount(q(0.75), true));
    }
  } else if (rule === 'scatter') {
    const [x, y] = cols;
    const xs = subset.map((r) => parseNumber(r[x.name])!);
    const ys = subset.map((r) => parseNumber(r[y.name])!);
    const r = pearson(xs, ys);
    add('x_field', 'the number on the x axis', x.name);
    add('y_field', 'the number on the y axis', y.name);
    if (r !== null) {
      add('correlation', `correlation between ${x.name} and ${y.name} (−1 to 1)`, twoPlaces.format(r), r);
      add('strength', 'how strongly they move together', strengthWord(r));
    }
  } else if (rule === 'count-heatmap') {
    const [a, b] = cols;
    const counts = new Map<string, number>();
    for (const row of subset) {
      const k = `${row[a.name].trim()} × ${row[b.name].trim()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const [topCell, topCount] = [...counts].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0] ?? [];
    if (topCell) {
      add('top_cell', `the most common ${a.name} and ${b.name} pair`, topCell);
      add('top_cell_count', 'records in that pair', whole.format(topCount));
    }
  }

  // The aggregate actually used, in words (a mean if the number is average only).
  if (cols.some((c) => c.type === 'quantitative')) add('aggregate', 'how values are combined', effectiveAggregate(cols, view.aggregate));
  return facts;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null; // one of them never changes: no correlation to speak of
  return sxy / Math.sqrt(sxx * syy);
}

// Conventional bands for |r|; the words are only a reading aid next to the number.
function strengthWord(r: number): string {
  const a = Math.abs(r);
  const dir = r > 0 ? 'positive' : 'negative';
  if (a >= 0.7) return `strong ${dir}`;
  if (a >= 0.4) return `moderate ${dir}`;
  if (a >= 0.2) return `weak ${dir}`;
  return 'little or no';
}

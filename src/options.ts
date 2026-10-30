import { isMissing, type Row } from './aggregate';
import { runChecks, type Finding } from './checks';
import { groupView } from './groups';
import { filterRows, type ChartView, type PathFilter } from './paths';
import type { ColumnProfile, DataProfile } from './profile';
import { facetOf, roleOf, rowNounOf, withRoleMeasures, type Facet, type Roles } from './roles';

// The menu of options (SPEC "The flow", step 1). Code builds every option from the data's
// columns, roles, and shape; the AI may later pick one of them, but never writes one. Each
// option carries its checks' findings, so code can tell which ones are safe to recommend.

export type OptionKind = 'comparison' | 'trend';

// Past about 12 bars a chart gets crowded (the rest are combined into "Other").
export const READABLE_GROUPS = 12;

export interface Option {
  id: string; // "comparison:format:revenue", "trend:sale date:count"
  question: string;
  kind: OptionKind;
  view: ChartView;
  column: string; // the category or date column
  measure: string | null; // the money column, or null when the option counts rows
  facet: Facet | null;
  findings: Finding[];
  effect: number | null; // see effectSize; compared only within one kind
  repairs: string | null; // the id of the option this one is a sturdier version of
}

// Question templates (approved by Adam). {many} is what the rows are called, in the plural.
const QUESTIONS = {
  comparisonMoney: 'Which {column} brings in the most {measure}?',
  comparisonCount: 'Which {column} has the most {many}?',
  flagMoney: 'How does {measure} split by {column}?',
  flagCount: 'How do {many} split by {column}?',
  trendMoney: 'How has {measure} changed over time?',
  trendCount: 'How has the number of {many} changed over time?',
};

const fill = (template: string, slots: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k]);

/** A question inside a slice (approved by Adam): "…? " becomes "… where genre is Fiction and format is Hardcover?" */
export function scopeQuestion(question: string, filters: PathFilter[]): string {
  if (filters.length === 0) return question;
  const where = filters.map((f) => `${f.field} is ${f.value}`).join(' and ');
  return `${question.replace(/\?$/, '')} where ${where}?`;
}

/**
 * Every option for a dataset, or for a slice of it, in a fixed menu order: one comparison per
 * readable category, entity, or flag column (2 to READABLE_GROUPS groups), each repair right
 * after the option it repairs, then one trend. Each is by the money measure, or by count when
 * there is none. With filters, groups are counted inside the slice, a filtered column is not
 * offered again (it has one value there), and every view and question carries the filters.
 */
export function buildOptions(profile: DataProfile, rows: Row[], roles: Roles, filters: PathFilter[] = []): Option[] {
  const effective = withRoleMeasures(profile, roles);
  const role = (c: ColumnProfile) => roleOf(roles, c.name);
  const many = rowNounOf(roles).many;

  // Without roles, any category column qualifies; with them, only labelled ones (never ids).
  const labelled = (c: ColumnProfile) => (roles.known ? ['category', 'entity', 'flag'].includes(role(c)!) : true);
  const slice = filterRows(rows, filters);
  const filtered = (c: ColumnProfile) => filters.some((f) => f.field === c.name);
  // Groups in the slice: the whole-data profile counts groups the slice may not have.
  const groupsIn = (c: ColumnProfile) => (filters.length === 0 ? c.distinct : new Set(slice.filter((r) => !isMissing(r[c.name])).map((r) => r[c.name].trim())).size);
  const readable = (c: ColumnProfile) => {
    const n = groupsIn(c);
    return n >= 2 && n <= READABLE_GROUPS;
  };
  const categories = effective.columns.filter((c) => c.type === 'nominal' && labelled(c) && !filtered(c) && readable(c));
  // The money measure: the "money" role, or without roles the first number a sum makes sense of.
  const numbers = effective.columns.filter((c) => c.type === 'quantitative' && c.count > 0);
  const money = roles.known ? numbers.find((c) => role(c) === 'money') : numbers.find((c) => c.measure === 'additive');
  const dates = effective.columns.filter((c) => c.type === 'temporal' && c.count > 0 && (!roles.known || role(c) === 'date'));

  const options: Option[] = [];
  const make = (kind: OptionKind, column: ColumnProfile, measure: string | null, repairs: string | null = null): Option => {
    const view: ChartView = { fields: measure ? [column.name, measure] : [column.name], aggregate: 'sum', filters };
    const flag = role(column) === 'flag';
    const template =
      kind === 'trend'
        ? measure ? QUESTIONS.trendMoney : QUESTIONS.trendCount
        : flag
          ? measure ? QUESTIONS.flagMoney : QUESTIONS.flagCount
          : measure ? QUESTIONS.comparisonMoney : QUESTIONS.comparisonCount;
    return {
      id: `${kind}:${column.name}:${measure ?? 'count'}`,
      question: scopeQuestion(fill(template, { column: column.name, measure: measure ?? '', many }), filters),
      kind,
      view,
      column: column.name,
      measure,
      facet: kind === 'comparison' ? facetOf(roles, column.name) : null,
      findings: runChecks(view, profile, rows, roles).findings,
      effect: effectSize(kind, view, effective, rows),
      repairs,
    };
  };

  for (const column of categories) {
    const option = make('comparison', column, money?.name ?? null);
    options.push(option);
    // A repair: only from a misleading finding whose check knows a sturdier view (today,
    // price/mix's count view). Other checks say what's wrong, not what's better. A repair
    // can't duplicate an option: mix needs a money measure, and then the menu has no counts.
    const sturdier = option.findings.find((f) => f.severity === 'misleading' && f.countView);
    if (sturdier) options.push(make('comparison', column, null, option.id));
  }
  if (dates[0] && slice.length > 0) options.push(make('trend', dates[0], money?.name ?? null));
  return options;
}

/**
 * The spec's effect size, a tie-breaker within one kind. Comparison: the effective number of
 * groups, 1 ÷ Σ share², which is how many real contenders there are (it rewards spread, never
 * dominance, which the concentration check penalizes). Trend: peak period ÷ trough period,
 * over periods with records. Null when the total or the trough is zero or less.
 */
export function effectSize(kind: OptionKind, view: ChartView, profile: DataProfile, rows: Row[]): number | null {
  const g = groupView(view, profile, rows);
  if (!g || g.groups.length === 0) return null;
  if (kind === 'comparison') {
    if (g.total === null || g.total <= 0) return null;
    return 1 / g.groups.reduce((s, x) => s + ((x.value ?? 0) / g.total!) ** 2, 0);
  }
  const values = g.groups.filter((x) => x.records > 0).map((x) => x.value ?? 0);
  const trough = Math.min(...values);
  return trough > 0 ? Math.max(...values) / trough : null;
}

export const isEligible = (o: Option) => !o.findings.some((f) => f.severity === 'misleading');

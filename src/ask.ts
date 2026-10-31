import { isMissing, type Row } from './aggregate';
import { ASK_TEXT } from './askText';
import { canSum, chooseRule, usesAggregate } from './chartRules';
import { MAX_FILTERS, summarizeProfile, type AiContext, type ChartView, type PathFilter } from './paths';
import type { Persona } from './personas';
import type { ColumnProfile, DataProfile } from './profile';
import { roleOf, rowNounOf, withRoleMeasures, type Facet, type Role, type Roles } from './roles';

// "Ask your own question" (SPEC "Prompt-a-path"): the most regulated AI piece. The AI turns
// the user's text into a structured result (build, clarify, reframe, refuse) and never
// writes an answer or a number. Code then decides what the user sees: it validates every
// chart the AI proposes, runs its own guard for causal and forecasting words on the user's
// text, and picks every message from askText.ts. The AI can't approve its own output.

export const MAX_ASK_CHARS = 300;
export const MAX_FIELDS = 2;
// Values of a category column the AI may see, so a filter can name a real value. Past this,
// only the top values go (a profile, never rows).
export const MAX_VALUES_SENT = 60;

export const REFRAME_CATEGORIES = ['causal', 'forecast', 'meaningless', 'loaded'] as const;
export const REFUSE_CATEGORIES = ['not_in_data', 'unrelated'] as const;
export type ReframeCategory = (typeof REFRAME_CATEGORIES)[number];
// Code's own refusals: an invalid chart, an unusable reply, no reply.
export type RefuseCategory = (typeof REFUSE_CATEGORIES)[number] | 'invalid' | 'unreadable' | 'unreachable';

export type AskResult =
  | { kind: 'build'; spec: ChartView }
  | { kind: 'clarify'; message: string; candidates: ChartView[] }
  | { kind: 'reframe'; category: ReframeCategory; message: string; spec: ChartView }
  | { kind: 'refuse'; category: RefuseCategory; message: string; spec: ChartView | null };

/** What the AI is sent: the question, the profile, the contract, the values, the current slice. */
export interface AskRequest extends AiContext {
  text: string;
  rowNoun: { one: string; many: string };
  columns: { name: string; role: Role | null; facet: Facet | null; values: string[] }[];
  scope: PathFilter[]; // the slice the user is looking at
}

export function buildAskRequest(text: string, profile: DataProfile, rows: Row[], roles: Roles, persona: Persona, scope: PathFilter[]): AskRequest {
  const facetOf = (c: string) => (roles.known ? (roles.facets[c] ?? null) : null);
  return {
    profile: summarizeProfile(profile),
    persona: { domain: persona.domain, role: persona.role, purpose: persona.purpose },
    text: text.slice(0, MAX_ASK_CHARS),
    rowNoun: rowNounOf(roles),
    // An id column can't be charted or filtered, so its values would only be noise.
    columns: profile.columns.map((c) => ({ name: c.name, role: roleOf(roles, c.name), facet: facetOf(c.name), values: roleOf(roles, c.name) === 'id' ? [] : valuesSent(c, rows) })),
    scope,
  };
}

/** Every value of a category column with at most MAX_VALUES_SENT of them, else its top values. */
function valuesSent(c: ColumnProfile, rows: Row[]): string[] {
  if (c.type !== 'nominal') return [];
  if (c.distinct > MAX_VALUES_SENT) return (c.topValues ?? []).map((t) => t.value);
  return [...new Set(rows.filter((r) => !isMissing(r[c.name])).map((r) => r[c.name].trim()))].sort();
}

// ---------------------------------------------------------------------------------------
// The guard: code reads the user's text, independently of the AI. Whole words, any case.
// Deliberately strict: "why" counts as causal even in "Why does Fiction rank higher?" (D-077).

const CAUSAL = /\b(cause[sd]?|causing|because|drive[sn]?|driving|why|effects?|affect(s|ed|ing)?|impact(s|ed|ing)?|leads? to|led to|results? in)\b/i;
const FORECAST = /\b(predict(s|ed|ing|ion|ions)?|forecast(s|ed|ing)?|going to|future|expect(s|ed|ing)?|next (month|quarter|year))\b/i;

export function guard(text: string): 'causal' | 'forecast' | null {
  if (CAUSAL.test(text)) return 'causal';
  if (FORECAST.test(text)) return 'forecast';
  return null;
}

// ---------------------------------------------------------------------------------------
// Validating one chart the AI proposed.

type Problem =
  | { code: 'tooMany' }
  | { code: 'unknownField'; name: string }
  | { code: 'idField'; field: string }
  | { code: 'noChart' }
  | { code: 'filterNotCategory'; field: string }
  | { code: 'unknownValue'; field: string; value: string }
  | { code: 'sumAverage'; field: string };

export type Validated = { ok: true; spec: ChartView } | { ok: false; problem: Problem };

/**
 * Checks a chart spec against the data: 1 or 2 fields that exist and can be drawn together,
 * no id column, at most MAX_FILTERS filters, each on a category column not also charted with
 * a value the data really has (exactly, after trimming), and no sum of a number that can
 * only be averaged (by role, or by name without roles). The first problem found is returned.
 */
export function validateSpec(raw: unknown, profile: DataProfile, rows: Row[], roles: Roles): Validated {
  const s = raw as Partial<ChartView> | null;
  const fields = Array.isArray(s?.fields) ? s!.fields.filter((f): f is string => typeof f === 'string') : [];
  const filters = Array.isArray(s?.filters) ? (s!.filters as unknown[]) : [];
  if (fields.length === 0 || fields.length > MAX_FIELDS || filters.length > MAX_FILTERS || new Set(fields).size !== fields.length) return { ok: false, problem: { code: 'tooMany' } };

  const effective = withRoleMeasures(profile, roles);
  const col = (name: string) => effective.columns.find((c) => c.name === name);
  const cols: ColumnProfile[] = [];
  for (const f of fields) {
    const c = col(f);
    if (!c) return { ok: false, problem: { code: 'unknownField', name: f } };
    if (roleOf(roles, f) === 'id') return { ok: false, problem: { code: 'idField', field: f } };
    cols.push(c);
  }
  const rule = chooseRule(cols.map((c) => c.type));
  if (!rule) return { ok: false, problem: { code: 'noChart' } };

  const clean: PathFilter[] = [];
  for (const raw of filters) {
    const f = raw as Partial<PathFilter> | null;
    const field = typeof f?.field === 'string' ? f.field : '';
    const value = typeof f?.value === 'string' ? f.value.trim() : '';
    const c = col(field);
    if (!c) return { ok: false, problem: { code: 'unknownField', name: field } };
    if (c.type !== 'nominal' || fields.includes(field) || clean.some((x) => x.field === field)) return { ok: false, problem: { code: 'filterNotCategory', field } };
    if (!rows.some((r) => !isMissing(r[field]) && r[field].trim() === value)) return { ok: false, problem: { code: 'unknownValue', field, value } };
    clean.push({ field, value });
  }

  const aggregate = s?.aggregate === 'mean' ? 'mean' : 'sum';
  // A sum only matters where the chart combines numbers; there it must be summable.
  if (aggregate === 'sum' && usesAggregate(rule) && !canSum(cols)) {
    const avg = cols.find((c) => c.type === 'quantitative' && c.measure !== 'additive')!;
    return { ok: false, problem: { code: 'sumAverage', field: avg.name } };
  }
  return { ok: true, spec: { fields, aggregate, filters: clean } };
}

// ---------------------------------------------------------------------------------------
// Turning the AI's reply into what the user sees.

export interface AskContext {
  text: string;
  profile: DataProfile;
  rows: Row[];
  roles: Roles;
}

const fill = (template: string, slots: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? '');

/** Every slot a message may use, for one spec. */
function slotsFor(spec: ChartView, ctx: AskContext): Record<string, string> {
  const p = withRoleMeasures(ctx.profile, ctx.roles);
  const cols = spec.fields.map((n) => p.columns.find((c) => c.name === n)!);
  const number = cols.find((c) => c.type === 'quantitative');
  const category = cols.find((c) => c.type === 'nominal');
  return {
    measure: number ? number.name : rowNounOf(ctx.roles).many,
    column: number?.name ?? '',
    field: category?.name ?? spec.fields[0],
  };
}

function problemMessage(p: Problem): string {
  switch (p.code) {
    case 'tooMany':
      return ASK_TEXT.tooMany;
    case 'unknownField':
      return fill(ASK_TEXT.unknownField, { name: p.name });
    case 'idField':
      return fill(ASK_TEXT.idField, { field: p.field });
    case 'noChart':
      return ASK_TEXT.noChart;
    case 'filterNotCategory':
      return fill(ASK_TEXT.filterNotCategory, { field: p.field });
    case 'unknownValue':
      return fill(ASK_TEXT.unknownValue, { field: p.field, value: p.value });
    case 'sumAverage':
      return fill(ASK_TEXT.sumAverage, { field: p.field });
  }
}

const refuse = (category: RefuseCategory, message: string, spec: ChartView | null = null): AskResult => ({ kind: 'refuse', category, message, spec });

/**
 * Code's decision on the AI's reply (D-077). Anything malformed is "unreadable". Every spec
 * is validated: an invalid build or reframe is refused with the code's reason; invalid
 * clarify candidates are dropped (one left becomes a plain build, none a refusal); an
 * invalid alternative on a refusal is dropped. The guard runs on the user's text: if it
 * fires on a build, the build becomes a causal or forecasting reframe.
 */
export function resolveAsk(reply: unknown, ctx: AskContext): AskResult {
  const r = reply as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return refuse('unreadable', ASK_TEXT.unreadable);
  const outcome = r.outcome;
  const category = r.category;
  const check = (spec: unknown) => validateSpec(spec, ctx.profile, ctx.rows, ctx.roles);

  if (outcome === 'build') {
    const v = check(r.spec);
    if (!v.ok) return refuse('invalid', problemMessage(v.problem));
    const fired = guard(ctx.text);
    if (fired) return reframe(fired, v.spec, ctx);
    return { kind: 'build', spec: v.spec };
  }

  if (outcome === 'clarify') {
    const candidates = (Array.isArray(r.candidates) ? r.candidates : []).slice(0, 3).flatMap((c) => {
      const v = check(c);
      return v.ok ? [v.spec] : [];
    });
    if (candidates.length === 0) return refuse('invalid', ASK_TEXT.unreadable);
    if (candidates.length === 1) {
      const fired = guard(ctx.text);
      return fired ? reframe(fired, candidates[0], ctx) : { kind: 'build', spec: candidates[0] };
    }
    // The ambiguous word must be one the user actually typed.
    const term = typeof r.term === 'string' && r.term.trim() !== '' && ctx.text.toLowerCase().includes(r.term.trim().toLowerCase()) ? r.term.trim() : null;
    return { kind: 'clarify', message: term ? fill(ASK_TEXT.clarify, { term }) : ASK_TEXT.clarifyGeneric, candidates };
  }

  if (outcome === 'reframe') {
    if (!REFRAME_CATEGORIES.includes(category as ReframeCategory)) return refuse('unreadable', ASK_TEXT.unreadable);
    const v = check(r.spec);
    if (!v.ok) return refuse('invalid', problemMessage(v.problem));
    return reframe(category as ReframeCategory, v.spec, ctx);
  }

  if (outcome === 'refuse') {
    if (!REFUSE_CATEGORIES.includes(category as (typeof REFUSE_CATEGORIES)[number])) return refuse('unreadable', ASK_TEXT.unreadable);
    // An alternative is optional: a spec with no fields means none was given.
    const given = Array.isArray((r.spec as { fields?: unknown } | null)?.fields) && (r.spec as { fields: unknown[] }).fields.length > 0;
    const alt = given ? check(r.spec) : null;
    const message =
      category === 'unrelated'
        ? ASK_TEXT.unrelated
        : fill(ASK_TEXT.notInData, { columns: ctx.profile.columns.filter((c) => roleOf(ctx.roles, c.name) !== 'id').map((c) => c.name).join(', ') });
    return refuse(category as RefuseCategory, message, alt?.ok ? alt.spec : null);
  }
  return refuse('unreadable', ASK_TEXT.unreadable);
}

function reframe(category: ReframeCategory, spec: ChartView, ctx: AskContext): AskResult {
  return { kind: 'reframe', category, spec, message: fill(ASK_TEXT[category], slotsFor(spec, ctx)) };
}

// ---------------------------------------------------------------------------------------
// A spec in plain words: "Revenue by genre, where format is Hardcover".

export function describeSpec(spec: ChartView, profile: DataProfile, roles: Roles): string {
  const p = withRoleMeasures(profile, roles);
  const cols = spec.fields.map((n) => p.columns.find((c) => c.name === n)).filter((c): c is ColumnProfile => !!c);
  const many = rowNounOf(roles).many;
  const date = cols.find((c) => c.type === 'temporal');
  const nums = cols.filter((c) => c.type === 'quantitative');
  const cats = cols.filter((c) => c.type === 'nominal');
  const mean = spec.aggregate === 'mean' || nums.some((c) => c.measure !== 'additive');
  const measure = nums[0] ? (mean ? `average ${nums[0].name}` : nums[0].name) : many;
  let text: string;
  if (date) text = `${measure} over time${cats[0] ? `, by ${cats[0].name}` : ''}`;
  else if (nums.length === 2) text = `${nums[0].name} against ${nums[1].name}`;
  else if (nums.length === 1 && cats.length === 0) text = `spread of ${nums[0].name}`;
  else text = `${measure} by ${cats.map((c) => c.name).join(' and ')}`;
  const where = spec.filters.map((f) => `${f.field} is ${f.value}`).join(' and ');
  const sentence = where ? `${text}, where ${where}` : text;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

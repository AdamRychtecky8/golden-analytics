import { askAi, type AskOptions } from './aiRequest';
import type { CheckId, Severity } from './checks';
import { isEligible, type Option, type OptionKind } from './options';
import { summarizeProfile, type PathFilter, type SuggestRequest } from './paths';
import type { Persona, Purpose } from './personas';
import type { DataProfile } from './profile';
import { rowNounOf, type Facet, type Roles } from './roles';

// The highlight (SPEC "The highlight"): gates, then rank, no weights. Code decides which
// options are eligible (no misleading finding). The AI may pick one of those for the persona
// and say why in one line with no digits; code checks its answer. Without a key, or if the
// AI's answer fails a check, rules pick, the same way every time.

/**
 * Which kind of option comes first for each purpose (Adam's table for the two-kind menu).
 * Ranked before facets, so this decides whether a purpose leads with a ranking or a trend.
 */
export const PURPOSE_KINDS: Record<Purpose, OptionKind[]> = {
  'deciding where to invest': ['comparison', 'trend'],
  'reporting results upward': ['trend', 'comparison'],
  'testing whether a pattern is real': ['comparison', 'trend'],
  'finding problems to fix': ['comparison', 'trend'],
  'getting a feel for the data': ['trend', 'comparison'],
};

/** Which facets each purpose prefers, in order (approved by Adam). */
export const PURPOSE_FACETS: Record<Purpose, Facet[]> = {
  'deciding where to invest': ['offering', 'place'],
  'reporting results upward': ['offering'],
  'testing whether a pattern is real': [],
  'finding problems to fix': ['source', 'place'],
  'getting a feel for the data': [],
};

// Rules reasons, in Adam's wording. A reason mentions a check only when a check caught
// something, so only the repair line does. bestPlace is the spec's draft copy.
export const REASONS = {
  facet: "Looking at {column} fits what you're doing: {purpose}.",
  kind: 'A {kind} is a good way into {purpose}.',
  repair: 'We count {many} here, because {measure} alone tells a misleading story about {column}.',
  bestPlace: "Every option in this data has a catch. This one's is the easiest to work around, and we'll show you how.",
};

export const HIGHLIGHT_NOTICES = {
  noKey: 'AI highlighting is off (no API key), so rules picked this.',
  unavailable: 'The AI couldn’t be reached, so rules picked this.',
  rejected: 'The AI’s pick didn’t pass the checks, so rules picked this.',
};

// About one line on the card. The AI's reason is rejected past this.
export const MAX_REASON_CHARS = 140;

export interface Highlight {
  id: string;
  label: 'highlight' | 'best-place-to-start'; // the second when nothing is eligible
  reason: string;
  source: 'ai' | 'rules';
  notice: string | null; // one quiet line when rules picked although the AI was asked
}

const fill = (template: string, slots: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k]);

/** Position in a list, with anything not listed after everything that is. */
const rank = <T>(list: readonly T[], x: T) => (list.includes(x) ? list.indexOf(x) : list.length);

/** Larger effect first, null last; only meaningful between options of the same kind. */
const byEffect = (a: Option, b: Option) => (a.kind !== b.kind ? 0 : (b.effect ?? -Infinity) - (a.effect ?? -Infinity));

/**
 * The rules highlight. Eligible options are ranked by the purpose's kind order, then its
 * preferred facets, then fewer caveats, then effect size, then menu order. With nothing eligible, the least
 * flagged option (fewest misleading, then fewest caveats, then effect, then menu order) is
 * the "best place to start". Null only when there are no options at all.
 */
export function rulesHighlight(options: Option[], persona: Pick<Persona, 'purpose'>, roles: Roles): Highlight | null {
  if (options.length === 0) return null;
  const order = (o: Option) => options.indexOf(o);
  const eligible = options.filter(isEligible);
  const count = (o: Option, s: Severity) => o.findings.filter((f) => f.severity === s).length;
  const caveats = (o: Option) => count(o, 'caveat');

  if (eligible.length === 0) {
    const [best] = [...options].sort(
      (a, b) => count(a, 'misleading') - count(b, 'misleading') || count(a, 'caveat') - count(b, 'caveat') || byEffect(a, b) || order(a) - order(b),
    );
    return { id: best.id, label: 'best-place-to-start', reason: REASONS.bestPlace, source: 'rules', notice: null };
  }

  const kinds = PURPOSE_KINDS[persona.purpose];
  const facets = PURPOSE_FACETS[persona.purpose];
  const [pick] = [...eligible].sort(
    (a, b) =>
      rank(kinds, a.kind) - rank(kinds, b.kind) ||
      rank(facets, a.facet) - rank(facets, b.facet) ||
      caveats(a) - caveats(b) ||
      byEffect(a, b) ||
      order(a) - order(b),
  );
  return { id: pick.id, label: 'highlight', reason: rulesReason(pick, options, persona.purpose, roles), source: 'rules', notice: null };
}

function rulesReason(pick: Option, options: Option[], purpose: Purpose, roles: Roles): string {
  const original = pick.repairs ? options.find((o) => o.id === pick.repairs) : undefined;
  const repair = original?.measure ? { many: rowNounOf(roles).many, measure: original.measure, column: original.column } : null;
  return reasonFor(pick, purpose, repair);
}

/**
 * The rules reason for an option: the facet line when the option's facet is one the purpose
 * prefers, otherwise the kind line, plus the repair line when the option repairs another.
 */
export function reasonFor(
  pick: Pick<Option, 'kind' | 'facet' | 'column'>,
  purpose: Purpose,
  repair: { many: string; measure: string; column: string } | null = null,
): string {
  const why =
    pick.facet && PURPOSE_FACETS[purpose].includes(pick.facet)
      ? fill(REASONS.facet, { column: pick.column, purpose })
      : fill(REASONS.kind, { kind: pick.kind, purpose });
  return repair ? `${why} ${fill(REASONS.repair, repair)}` : why;
}

// ---------------------------------------------------------------------------------------
// The AI's pick. It sees the profile summary, the persona, and the eligible options only.

export interface HighlightOption {
  id: string;
  question: string;
  kind: OptionKind;
  facet: Facet | null;
  findings: { check: CheckId; severity: Severity }[]; // eligible options: caveats only
}

export interface HighlightRequest {
  profile: SuggestRequest['profile'];
  persona: SuggestRequest['persona'];
  options: HighlightOption[];
}

export function buildHighlightRequest(eligible: Option[], profile: DataProfile, persona: Persona): HighlightRequest {
  return {
    profile: summarizeProfile(profile),
    persona: { domain: persona.domain, role: persona.role, purpose: persona.purpose },
    options: eligible.map((o) => ({
      id: o.id,
      question: o.question,
      kind: o.kind,
      facet: o.facet,
      findings: o.findings.map((f) => ({ check: f.id, severity: f.severity })),
    })),
  };
}

/** The AI's { id, reason } if it passes every check, else null. */
export function checkAiPick(body: Record<string, unknown>, eligibleIds: string[]): { id: string; reason: string } | null {
  const { id, reason } = body;
  if (typeof id !== 'string' || !eligibleIds.includes(id)) return null;
  if (typeof reason !== 'string') return null;
  const text = reason.trim();
  // No digits: every number the user sees comes from code (D-052).
  if (text === '' || text.length > MAX_REASON_CHARS || /\d/.test(text)) return null;
  return { id, reason: text };
}

/** Cache key: the same dataset, persona, and slice always get the same highlight. */
export const highlightKey = (dataset: string | number, persona: Pick<Persona, 'domain' | 'role' | 'purpose'>, filters: PathFilter[] = []) =>
  JSON.stringify([dataset, persona.domain, persona.role, persona.purpose, filters.map((f) => [f.field, f.value])]);

export interface HighlightLoadOptions extends AskOptions {
  cache?: Map<string, Promise<Highlight | null>>;
  cacheKey?: string;
}

/**
 * The highlight for a menu: asks the AI to pick among the eligible options, checks its
 * answer, and falls back to the rules with a quiet notice. With nothing eligible, the AI is
 * not asked at all. Never throws. With a cache and key, each key is asked once.
 */
export function loadHighlight(
  options: Option[],
  profile: DataProfile,
  persona: Persona,
  roles: Roles,
  load: HighlightLoadOptions = {},
): Promise<Highlight | null> {
  const { cache, cacheKey } = load;
  if (cache && cacheKey !== undefined && cache.has(cacheKey)) return cache.get(cacheKey)!;
  const result = pickHighlight(options, profile, persona, roles, load);
  if (cache && cacheKey !== undefined) cache.set(cacheKey, result);
  return result;
}

async function pickHighlight(options: Option[], profile: DataProfile, persona: Persona, roles: Roles, ask: AskOptions): Promise<Highlight | null> {
  const rules = rulesHighlight(options, persona, roles);
  const eligible = options.filter(isEligible);
  if (!rules || eligible.length === 0) return rules; // code only: the AI never sees ineligible options

  const reply = await askAi('/api/highlight', buildHighlightRequest(eligible, profile, persona), ask);
  if (!reply.ok) return { ...rules, notice: reply.reason === 'no-key' ? HIGHLIGHT_NOTICES.noKey : HIGHLIGHT_NOTICES.unavailable };
  const pick = checkAiPick(reply.body, eligible.map((o) => o.id));
  if (!pick) {
    console.info('[highlight] AI pick rejected:', { id: reply.body.id, reason: reply.body.reason });
    return { ...rules, notice: HIGHLIGHT_NOTICES.rejected };
  }
  return { id: pick.id, label: 'highlight', reason: pick.reason, source: 'ai', notice: null };
}

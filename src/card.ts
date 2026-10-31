import type { Row } from './aggregate';
import { ASKED_CANNOT } from './askText';
import { CAUTIONS, CANNOT, DATASET_LINE, ASK, TALK } from './cardText';
import { chooseRule } from './chartRules';
import { CHECK_IDS, SEVERITIES, runChecks, type CheckId, type Evidence, type Finding, type Severity } from './checks';
import type { DatasetFinding } from './datasetFindings';
import { computeFacts, type Fact } from './facts';
import { groupView, periodLabel } from './groups';
import type { ChartView } from './paths';
import type { DataProfile } from './profile';
import { groupLabel, rowNounOf, type Roles } from './roles';
import { fillTemplate } from './templates';

// The present card (SPEC "The flow", step 4): Key talking points, Caution around these, If
// they ask, What this data can't tell you. Code builds every block from facts (D-052): each
// is a template whose slots name facts, filled by fillTemplate, so the card works with no AI
// and every number on it is traceable. The AI may later rephrase some blocks (cardAi.ts).

export type SectionId = 'talk' | 'caution' | 'ask' | 'cannot';

/**
 * Where each finding goes: one table, every check and severity (a test walks them all, so a
 * new check can't silently disappear). Cautions are problems the chart hides; a true fact
 * the chart shows is a talking point. Routing to be revisited after testing real cards.
 */
export const ROUTES: Record<CheckId, Record<Severity, SectionId>> = {
  mix: { misleading: 'caution', caveat: 'ask' }, // a lower group moving is a question, not a trap
  entity: { misleading: 'caution', caveat: 'talk' },
  small: { misleading: 'caution', caveat: 'ask' },
  fragile: { misleading: 'caution', caveat: 'caution' },
  concentration: { misleading: 'caution', caveat: 'talk' }, // never misleading today
  cycle: { misleading: 'cannot', caveat: 'cannot' }, // never misleading today
};

// Order of cautions, and so of the headline's source: the misleading ones first.
const CAUTION_PRIORITY = ['mixTop', 'entity', 'small', 'fragile'] as const;
type CautionKind = (typeof CAUTION_PRIORITY)[number];
const MAX_WHYS = 3;
const MAX_POINTS = 3;
const MAX_ASKS = 2;
const MAX_WORDS = 60; // per block: a sentence or two, never a paragraph

/** One piece of card text: its template (what the AI sees), the filled text, and its slots. */
export interface Block {
  id: string; // stable within a card: "headline", "point.1", "caution.Hardcover.why.0", ...
  template: string;
  text: string;
  slots: string[];
  // Locked: the AI may not rephrase it (a headline that stands in for a caution or the
  // can't-tell line). Rephrasable: the AI may (Key talking points and If they ask only).
  locked: boolean;
  rephrasable: boolean;
}

export interface CautionEntry {
  group: string; // the group the claim is about
  checks: CheckId[]; // the findings merged into it, highest priority first
  claim: Block;
  whys: Block[]; // up to three, in priority order
  instead: Block;
}

export interface AskEntry {
  question: Block;
  answer: Block;
}

export interface Card {
  datasetLine: Block | null;
  headline: Block;
  points: Block[];
  cautions: CautionEntry[];
  asks: AskEntry[];
  cannot: Block[]; // always at least one line
  highlight: string | null; // the chart mark the headline is about (its key), or null
  facts: Fact[];
  // Routed findings whose text failed to fill (a missing slot): always empty, or a test fails,
  // so a finding can't silently vanish from the card.
  unrendered: CheckId[];
}

const percent = (x: number) => `${Math.round(x * 100)}%`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * The card for a view. `dataset` is the dataset-level findings (datasetFindings over the
 * top-level menu): when this view's findings name one of those entities, the card says so
 * once above the sections, and the entity caution refers to it rather than repeat it.
 */
export function buildCard(
  view: ChartView,
  profile: DataProfile,
  rows: Row[],
  roles: Roles,
  dataset: DatasetFinding[] = [],
  // A typed question code reframed: the can't-tell line answers what was asked.
  asked: { reframe: 'causal' | 'forecast' | null } | null = null,
): Card {
  const noun = rowNounOf(roles);
  const base = computeFacts(view, profile, rows, roles);
  const extra: Fact[] = [
    { id: 'many', label: 'what the rows are called', display: noun.many },
    { id: 'one', label: 'what one row is called', display: noun.one },
  ];
  const add = (id: string, label: string, display: string) => extra.push({ id, label, display });
  const g = groupView(view, profile, rows);
  const field = g?.field.name ?? view.fields[0];
  add('field', 'what the groups are', field);
  if (g?.timeUnit) add('unit', 'the length of one period', g.timeUnit);
  // A yes/no group reads as the contract names it, or "award winner: no" (same as facts.ts).
  const label = (x: string) => groupLabel(roles, field, x);
  if (view.filters.length > 0) add('scope_where', 'the slice', view.filters.map((f) => `${f.field} is ${f.value}`).join(' and '));

  const findings = runChecks(view, profile, rows, roles).findings;
  const routed = (s: SectionId) => findings.filter((f) => ROUTES[f.id][f.severity] === s);

  // The dataset line: an entity this view's findings name, which shapes several charts.
  const named = new Set(findings.flatMap((f) => entityNamed(f.evidence)));
  const ds = dataset.find((d) => named.has(d.entity));
  if (ds) {
    const share = ds.shares.find((s) => s.measure === (g?.measure?.name ?? null)) ?? ds.shares[0];
    add('ds_entity', 'an entity that shapes several charts', ds.entity);
    add('ds_column', 'what kind of entity', ds.column);
    add('ds_measure', 'the measure of its share', share.measure ?? noun.many);
    if (share.share !== null) add('ds_share', `its share of all ${share.measure ?? noun.many}`, percent(share.share));
  }

  // Slot facts from each finding's evidence.
  for (const f of findings) addEvidenceFacts(f, add, label, g?.groups.length ?? 0, g?.groups.length === 2 ? g.groups[1].label : null);
  const unrendered: CheckId[] = [];
  const facts = [...base, ...extra];

  const block = (id: string, template: string, opts: { locked?: boolean; rephrasable?: boolean } = {}): Block | null => {
    const filled = fillTemplate(template, facts, MAX_WORDS);
    if (!filled.ok) return null;
    return { id, template, text: filled.text, slots: filled.slots, locked: opts.locked ?? false, rephrasable: opts.rephrasable ?? false };
  };

  // ---- Cautions, merged by the group they're about.
  const entries: CautionEntry[] = [];
  for (const kind of CAUTION_PRIORITY) {
    const f = routed('caution').find((x) => cautionKind(x) === kind);
    if (!f) continue;
    const text = cautionText(kind, f, ds !== undefined);
    const group = subjectOf(kind, f.evidence);
    let entry = entries.find((e) => e.group === group);
    const key = `caution.${group}`;
    if (!entry) {
      const claim = block(`${key}.claim`, text.claim);
      const instead = block(`${key}.instead`, text.instead);
      if (!claim || !instead) {
        unrendered.push(f.id);
        continue;
      }
      entry = { group, checks: [], claim, whys: [], instead };
      entries.push(entry);
    }
    const why = block(`${key}.why.${entry.whys.length}`, text.why);
    if (!why) unrendered.push(f.id);
    else if (entry.whys.length < MAX_WHYS) {
      entry.whys.push(why);
      entry.checks.push(f.id);
    }
  }

  // ---- What this data can't tell you: always one line, plus the slice.
  const rule = chooseRule(view.fields.map((n) => profile.columns.find((c) => c.name === n)?.type ?? 'nominal'));
  const cycle = routed('cannot').find((f) => f.id === 'cycle');
  const mean = g?.aggregate === 'mean';
  const cannotTemplate = cycle
    ? CANNOT.cycle
    : g?.by === 'period'
      ? CANNOT.trend
      : g?.by === 'category'
        ? mean
          ? CANNOT.comparisonMean
          : CANNOT.comparison
        : rule === 'histogram'
          ? CANNOT.spread
          : rule === 'scatter'
            ? CANNOT.scatter
            : rule === 'count-heatmap'
              ? CANNOT.heatmap
              : CANNOT.general;
  // An asked causal question: its line replaces the general one. An asked forecast: its line
  // replaces the general trend line, and sits beside the single-cycle line when both apply.
  const echo = asked?.reframe === 'causal' ? ASKED_CANNOT.causal : asked?.reframe === 'forecast' ? ASKED_CANNOT.forecast : null;
  const keepCycle = cycle && asked?.reframe === 'forecast';
  const cannotLine = block('cannot', echo && !keepCycle ? echo : cannotTemplate, { locked: true });
  if (cycle && !cannotLine) unrendered.push('cycle');
  const echoLine = keepCycle ? block('cannot.asked', echo!, { locked: true }) : null;
  const cannot = [cannotLine, echoLine, view.filters.length > 0 ? block('cannot.scope', CANNOT.scope, { locked: true }) : null].filter(
    (b): b is Block => b !== null,
  );
  if (cannot.length === 0) cannot.push({ id: 'cannot', template: CANNOT.general, text: CANNOT.general, slots: [], locked: true, rephrasable: false });

  // ---- The headline. It may never assert what a caution warns against, or what the
  // can't-tell line says can't be known: with a caution, it is that caution's "instead";
  // for a single-cycle trend, it describes shape only. Either way it is locked.
  const kindHeadline = () =>
    g?.by === 'period'
      ? cycle
        ? TALK.headlineTrendShape
        : TALK.headlineTrend
      : g?.by === 'category'
        ? mean
          ? TALK.headlineMean
          : g.measure
            ? TALK.headlineMoney
            : TALK.headlineCount
        : rule === 'histogram'
          ? TALK.headlineSpread
          : rule === 'scatter'
            ? TALK.headlineScatter
            : TALK.headlineHeatmap;
  let headline: Block | null = null;
  if (entries.length > 0) headline = { ...entries[0].instead, id: 'headline', locked: true, rephrasable: false };
  else {
    const t = kindHeadline();
    headline = block('headline', t, { locked: t === TALK.headlineTrendShape, rephrasable: t !== TALK.headlineTrendShape });
  }
  if (!headline) {
    const t = `This chart shows {record_count} {many}.`;
    headline = block('headline', t, { rephrasable: true })!;
  }

  // ---- Key talking points: routed findings first, then facts; at most three.
  const pointTemplates: { template: string; from?: CheckId }[] = [];
  const concentration = routed('talk').find((f) => f.id === 'concentration');
  const concentrationTemplate = g?.groups.length === 2 ? TALK.pointConcentrationTwo : TALK.pointConcentration;
  for (const f of routed('talk')) pointTemplates.push({ template: f.id === 'concentration' ? concentrationTemplate : TALK.pointEntity, from: f.id });
  if (g?.by === 'category') {
    if (mean) pointTemplates.push({ template: TALK.pointTopMean });
    else {
      if (!concentration) pointTemplates.push({ template: TALK.pointTop }); // the concentration point already says the top share
      pointTemplates.push({ template: TALK.pointRunnerUp });
    }
  } else if (g?.by === 'period') {
    pointTemplates.push({ template: TALK.pointPeak }, { template: TALK.pointLow });
  } else if (rule === 'histogram') pointTemplates.push({ template: TALK.pointSpread });
  else if (rule === 'scatter') pointTemplates.push({ template: TALK.pointScatter });
  else if (rule === 'count-heatmap') pointTemplates.push({ template: TALK.pointHeatmap });
  const points: Block[] = [];
  for (const { template: t, from } of pointTemplates) {
    if (points.length >= MAX_POINTS) break;
    const b = block(`point.${points.length}`, t, { rephrasable: true });
    if (!b && from) unrendered.push(from);
    // Never a point that repeats a caution's claim, or the headline itself.
    if (b && b.text !== headline.text && !entries.some((e) => e.claim.text === b.text)) points.push(b);
  }

  // ---- If they ask: from repairs and routed findings, at most two.
  const asks: AskEntry[] = [];
  const ask = (q: string, a: string): boolean => {
    if (asks.length >= MAX_ASKS) return true;
    const n = asks.length;
    const question = block(`ask.${n}.q`, q, { rephrasable: true });
    const answer = block(`ask.${n}.a`, a, { rephrasable: true });
    if (!question || !answer) return false;
    // Never a question whose answer a talking point already gives.
    if (!points.some((p) => p.text === answer.text)) asks.push({ question, answer });
    return true;
  };
  if (findings.some((f) => f.id === 'mix' && f.severity === 'misleading' && f.countView)) ask(ASK.repairQ, ASK.repairA);
  // The entity question only when the dataset line isn't already saying it.
  if (findings.some((f) => f.id === 'entity') && !ds) ask(ASK.entityQ, ASK.entityA);
  const mover = routed('ask').find((f) => f.id === 'mix');
  if (mover && asks.length < MAX_ASKS && !ask(ASK.moverQ, ASK.moverA)) unrendered.push('mix');
  const smallTail = routed('ask').find((f) => f.id === 'small');
  if (smallTail && asks.length < MAX_ASKS && !ask(ASK.smallQ, (smallTail.evidence as { small: unknown[] }).small.length === 1 ? ASK.smallOneA : ASK.smallManyA)) {
    unrendered.push('small');
  }

  const datasetLine = ds ? block('dataset', DATASET_LINE, { locked: true }) : null;

  return { datasetLine, headline, points, cautions: entries, asks, cannot, highlight: highlightKey(entries, g), facts, unrendered };
}

/** Which caution text a finding uses. */
function cautionKind(f: Finding): CautionKind | null {
  if (f.id === 'mix') return f.severity === 'misleading' ? 'mixTop' : null;
  if (f.id === 'entity') return 'entity';
  if (f.id === 'small') return 'small';
  if (f.id === 'fragile') return 'fragile';
  return null;
}

function cautionText(kind: CautionKind, f: Finding, datasetLine: boolean): { claim: string; why: string; instead: string } {
  if (kind === 'small' && (f.evidence as { period?: boolean }).period) return CAUTIONS.smallPeriod;
  if (kind === 'entity') return { ...CAUTIONS.entity, why: datasetLine ? CAUTIONS.entity.whyDataset : CAUTIONS.entity.why };
  if (kind === 'fragile') return (f.evidence as { narrow: boolean }).narrow ? CAUTIONS.fragileNarrow : CAUTIONS.fragileFlip;
  return CAUTIONS[kind];
}

/** The group a caution is about, so cautions about the same group merge into one entry. */
function subjectOf(kind: CautionKind, e: Evidence): string {
  if (e.check === 'mix') return e.groups[0].label;
  if (e.check === 'entity') return e.group;
  if (e.check === 'small') return e.top.label;
  if (e.check === 'fragile') return e.top.label;
  return kind;
}

/** The entity a finding names (entity check, or a fragile lead's flip). */
function entityNamed(e: Evidence): string[] {
  if (e.check === 'entity') return [e.entity];
  if (e.check === 'fragile' && e.flip) return [e.flip.entity];
  return [];
}

/** Slot facts from a finding's evidence ("{mix_most_records}", "{entity_rank}", ...). */
function addEvidenceFacts(
  f: Finding,
  add: (id: string, label: string, display: string) => void,
  label: (x: string) => string,
  groupCount: number,
  other: string | null, // the second group, when there are exactly two
): void {
  const e = f.evidence;
  if (e.check === 'mix') {
    if (f.severity === 'misleading') {
      const [top, most] = e.groups;
      add('mix_top', 'the group first by value', label(top.label));
      add('mix_most', 'the group first by count', label(most.label));
      add('mix_top_records', `records in ${top.label}`, whole.format(top.records));
      add('mix_most_records', `records in ${most.label}`, whole.format(most.records));
    } else {
      const [m] = e.groups;
      add('mover', 'the group that moves between rankings', label(m.label));
      add('mover_value_rank', 'its rank by value', ordinal(m.valueRank));
      add('mover_count_rank', 'its rank by count', ordinal(m.countRank));
      add('mover_prices', 'whether its prices are higher or lower', m.valueRank < m.countRank ? 'higher' : 'lower');
      add('mover_direction', 'whether it ranks higher or lower by value than by count', m.valueRank < m.countRank ? 'higher' : 'lower');
    }
  } else if (e.check === 'entity') {
    add('entity_group', 'the group one entity drives', label(e.group));
    add('entity_column', 'what kind of entity', e.column);
    add('entity_name', 'the entity', e.entity);
    add('entity_share', `its share of ${e.group}`, percent(e.share));
    add('entity_rank', `${e.group}'s rank without it`, ordinal(e.rankWithout));
  } else if (e.check === 'small') {
    add('small_top', 'the top group', label(e.top.label));
    add('small_records', 'records in the top group', whole.format(e.top.records));
    add('small_threshold', 'the fewest records a group needs', whole.format(e.threshold));
    add('small_count', 'how many groups are small', whole.format(e.small.length));
    add('smallest', 'the smallest group', label(e.smallest.label));
    add('smallest_records', 'records in the smallest group', whole.format(e.smallest.records));
  } else if (e.check === 'fragile') {
    add('fragile_top', 'the group in first place', label(e.top.label));
    add('fragile_second', 'the group in second place', label(e.second.label));
    add('fragile_gap', 'how far first is ahead of second', `${((e.ratio - 1) * 100).toFixed(1)}%`);
    if (e.flip) {
      add('flip_column', 'what kind of entity', e.flip.column);
      add('flip_entity', 'the entity that tips the lead', e.flip.entity);
      add('flip_rank', 'the top group rank without it', ordinal(e.flip.rankWithout));
    }
  } else if (e.check === 'concentration') {
    add('conc_group', 'the group that dominates', label(e.group));
    add('conc_share', 'its share of the total', percent(e.share));
    add('conc_others', 'how many other groups there are', whole.format(groupCount - 1));
    if (other !== null) add('conc_other', 'the only other group', label(other));
  } else if (e.check === 'cycle') {
    add('cycle_first', 'the first date', periodLabel(e.first, 'day'));
    add('cycle_last', 'the last date', periodLabel(e.last, 'day'));
  }
}

/** The chart mark the headline is about: the caution's group, the top group, or the peak period. */
function highlightKey(entries: CautionEntry[], g: ReturnType<typeof groupView>): string | null {
  if (!g || g.groups.length === 0) return null;
  if (g.by === 'category') return entries[0]?.group ?? g.groups[0].label;
  const valued = g.groups.filter((p) => p.value !== null && p.records > 0);
  if (valued.length === 0) return null;
  const peak = valued.reduce((a, b) => (b.value! > a.value! ? b : a));
  return String(Date.parse(peak.label)); // line marks are keyed by the period's start time
}

/** Every check and severity has a route (the routing test walks this). */
export const ALL_ROUTES = CHECK_IDS.flatMap((id) => SEVERITIES.map((s) => ({ id, severity: s, section: ROUTES[id]?.[s] })));

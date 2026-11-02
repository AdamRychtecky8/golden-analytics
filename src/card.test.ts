import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES, buildCard, type Card } from './card';
import { CHECK_IDS, SEVERITIES, runChecks } from './checks';
import { datasetFindings } from './datasetFindings';
import { degenerateDatasets, randomDataset, type Generated } from './fixtures/generateDataset';
import { groupView } from './groups';
import { parseCsv } from './loadCsv';
import { buildOptions } from './options';
import type { ChartView } from './paths';
import { profileDataset } from './profile';
import { UNKNOWN_ROLES, bookshopRoles, parseRoles } from './roles';

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);
const dataset = datasetFindings(buildOptions(profile, rows, roles), rows);
const view = (fields: string[], filters: ChartView['filters'] = []): ChartView => ({ fields, aggregate: 'sum', filters });
const card = (fields: string[]) => buildCard(view(fields), profile, rows, roles, dataset);
const allText = (c: Card) =>
  [c.datasetLine, c.headline, ...c.points, ...c.cautions.flatMap((e) => [e.claim, ...e.whys, e.instead]), ...c.asks.flatMap((a) => [a.question, a.answer]), ...c.cannot]
    .filter((b) => b !== null)
    .map((b) => b!.text);

describe('routing', () => {
  it('has a section for every check and severity, so no finding can silently disappear', () => {
    const ALL_ROUTES = CHECK_IDS.flatMap((id) => SEVERITIES.map((s) => ({ id, severity: s, section: ROUTES[id]?.[s] })));
    expect(ALL_ROUTES).toHaveLength(CHECK_IDS.length * SEVERITIES.length);
    for (const r of ALL_ROUTES) expect(['talk', 'caution', 'ask', 'cannot'], `${r.id}/${r.severity}`).toContain(r.section);
  });

  it('follows the approved table', () => {
    expect(ROUTES.mix).toEqual({ misleading: 'caution', caveat: 'ask' });
    expect(ROUTES.entity).toEqual({ misleading: 'caution', caveat: 'talk' });
    expect(ROUTES.small).toEqual({ misleading: 'caution', caveat: 'ask' });
    expect(ROUTES.fragile.caveat).toBe('caution');
    expect(ROUTES.concentration.caveat).toBe('talk');
    expect(ROUTES.cycle.caveat).toBe('cannot');
  });
});

describe('Bookshop cards', () => {
  it('revenue by format: one merged caution about Hardcover, and a headline that is its "instead"', () => {
    const c = card(['format', 'revenue']);
    expect(c.cautions).toHaveLength(1);
    const [hard] = c.cautions;
    expect(hard.checks).toEqual(['mix', 'entity', 'fragile']); // merged, in priority order
    expect(hard.claim.text).toBe('Hardcover is our best-selling format.');
    expect(hard.instead.text).toBe('Hardcover brings in the most revenue, but Mass market paperback has the most items sold.');
    expect(c.headline.text).toBe(hard.instead.text);
    expect(c.headline.locked).toBe(true);
    expect(c.headline.text).not.toMatch(/Hardcover is (our )?(the )?(top|best)/i);
    expect(c.highlight).toBe('Hardcover');
  });

  it('revenue by genre: an entity caution that refers to the dataset-level line instead of repeating it', () => {
    const c = card(['genre', 'revenue']);
    expect(c.datasetLine?.text).toBe('One author, Bianca Thompson, accounts for 33% of all revenue in this data and shapes several of these charts.');
    const sci = c.cautions.find((e) => e.group === 'SciFi/Fantasy')!;
    expect(sci.checks).toEqual(['entity']);
    expect(sci.whys[0].text).toBe('The author noted above accounts for 79% of revenue in SciFi/Fantasy; without that author, SciFi/Fantasy would rank 4th.');
    expect(sci.whys[0].text).not.toContain('Bianca Thompson');
  });

  it('publisher by revenue: concentration is a talking point, and there is no caution', () => {
    const c = card(['publisher', 'revenue']);
    expect(c.cautions).toEqual([]);
    expect(c.points.map((p) => p.text)).toContain('Etaoin Shrdlu Press alone accounts for 71% of revenue; the other 3 share the rest.');
  });

  it('revenue over time: single cycle under "can\'t tell you", and a headline about shape, not change', () => {
    const c = card(['sale date', 'revenue']);
    expect(c.cannot[0].text).toBe("These dates cover one year or less (Jan 2, 2193 to Dec 31, 2193), so seasonal swings can't be told apart from growth or decline.");
    expect(c.headline.text).toBe('Revenue peaked in Aug 2193 and was lowest in Feb 2193.');
    expect(c.headline.locked).toBe(true);
    expect(allText(c).join(' ')).not.toMatch(/rose|fell|\+\d/);
  });

  it('a yes/no group reads as the contract labels it', () => {
    expect(card(['award winner']).headline.text).toMatch(/^Non-winners /);
  });

  it('revenue by genre: a lower group moving (Fiction) is a question, not a caution; no entity question under the dataset line', () => {
    const c = card(['genre', 'revenue']);
    expect(c.cautions.map((e) => e.group)).toEqual(['SciFi/Fantasy']);
    expect(c.asks.map((a) => a.question.text)).toEqual(['Why does Fiction rank higher by revenue than by items sold?']);
  });

  it('every check routed to a section shows up in it (nothing unrendered)', () => {
    for (const o of buildOptions(profile, rows, roles)) expect(buildCard(o.view, profile, rows, roles, dataset).unrendered, o.id).toEqual([]);
  });

  it('every number on a card comes from a fact', () => {
    for (const fields of [['format', 'revenue'], ['genre', 'revenue'], ['sale date', 'revenue']]) {
      const c = card(fields);
      for (const text of allText(c)) {
        let rest = text;
        // Remove every fact's display text; what's left may have no digits.
        for (const f of [...c.facts].sort((a, b) => b.display.length - a.display.length)) rest = rest.split(f.display).join(' ');
        expect(rest, text).not.toMatch(/\d/);
      }
    }
  });
});

describe('the headline rule, on generated datasets', () => {
  const datasets: Generated[] = [...Array.from({ length: 120 }, (_, i) => randomDataset(i + 1)), ...degenerateDatasets()];
  const CHANGE_SLOTS = ['first_period', 'last_period', 'first_value', 'last_value', 'change', 'change_pct', 'direction'];

  it('never asserts what a caution warns against or what "can\'t tell" says is unknowable; nothing vanishes', () => {
    let cautioned = 0;
    let cycles = 0;
    for (const d of datasets) {
      const p = profileDataset(d.columns, d.rows);
      const pairs = d.columns.flatMap((a, i) => [[a], ...d.columns.slice(i + 1).map((b) => [a, b])]);
      for (const fields of pairs) {
        const v = view(fields);
        const where = `${d.name}, ${fields.join(' + ')}`;
        const c = buildCard(v, p, d.rows, d.roles);
        expect(c.unrendered, where).toEqual([]);
        if (c.cautions.length > 0) {
          cautioned++;
          expect(c.headline.text, where).toBe(c.cautions[0].instead.text);
          expect(c.headline.locked, where).toBe(true);
          for (const pt of c.points) expect(c.cautions.map((e) => e.claim.text), where).not.toContain(pt.text);
        }
        // With or without a caution, a single-cycle chart's headline never states a change.
        if (runChecks(v, p, d.rows, d.roles).findings.some((f) => f.id === 'cycle')) {
          cycles++;
          expect(c.headline.slots.filter((s) => CHANGE_SLOTS.includes(s)), where).toEqual([]);
          expect(c.headline.locked, where).toBe(true);
          for (const pt of c.points) expect(pt.slots.filter((s) => CHANGE_SLOTS.includes(s)), where).toEqual([]);
        }
      }
    }
    // Not vacuous: both rules were exercised.
    expect(cautioned).toBeGreaterThan(0);
    expect(cycles).toBeGreaterThan(0);
  });
});

describe('a small group on a chart over time', () => {
  it('names the period with its unit: "{period} was our best {unit}"', () => {
    // Synthetic: 5 sales in March 2025 and 3 in June; every month is under 30 records.
    const data = [
      ...Array.from({ length: 5 }, () => ({ day: '2025-03-10', sales: '100' })),
      ...Array.from({ length: 3 }, () => ({ day: '2025-06-10', sales: '10' })),
    ];
    const c = buildCard({ fields: ['day', 'sales'], aggregate: 'sum', filters: [] }, profileDataset(['day', 'sales'], data), data, UNKNOWN_ROLES);
    expect(c.cautions[0].claim.text).toBe('Mar 2025 was our best month.');
  });
});

describe('an asked question that code reframed', () => {
  it('causal: the can’t-tell line answers the question that was asked', () => {
    const c = buildCard(view(['award winner', 'revenue']), profile, rows, roles, dataset, { reframe: 'causal' });
    expect(c.cannot[0].text).toBe(
      'You asked whether award winner affects revenue. This shows that revenue differs by award winner, not that award winner causes the difference: other differences between the groups could explain it.',
    );
  });

  it('forecast: its line sits beside the single-cycle line, which still applies', () => {
    const c = buildCard(view(['sale date', 'revenue']), profile, rows, roles, dataset, { reframe: 'forecast' });
    expect(c.cannot.map((b) => b.text)).toEqual([
      "These dates cover one year or less (Jan 2, 2193 to Dec 31, 2193), so seasonal swings can't be told apart from growth or decline.",
      "This shows how revenue has changed so far; it can't say what comes next.",
    ]);
  });
});


describe('plural group names (the contract marks award winner\'s names as plural)', () => {
  it('verbs agree, and the claim does not repeat the column after the name', () => {
    const c = card(['award winner', 'revenue']);
    expect(c.headline.text).toBe('Award winners bring in the most revenue, but non-winners have the most items sold.');
    // Two groups: the concentration point names the other one, so there is no runner-up point.
    expect(c.points.map((p) => p.text)).toEqual(['Award winners alone account for 51% of revenue; non-winners have the rest.']);
    expect(c.cautions[0].claim.text).toBe('Award winners sell the most.');
    expect(c.cannot[0].text).toBe('This shows the split of revenue by award winner, not why.');
  });

  it('a singular group still reads singular', () => {
    expect(card(['format', 'revenue']).points[1].text).toBe('Next is Mass market paperback at 244,408 in revenue.');
  });
});

describe('a comparison with only one group', () => {
  // Never offered by the menu (every slice's menu needs 2 to 12 groups); reachable through
  // Build my own chart or a typed question inside a slice.
  const RANKING = /(most|highest|lowest|top|leads?|ahead|next|ranks?|best|stronger|second)|100%/i;

  it('items sold by award winner inside Mystery: no ranking, no share, no runner-up', () => {
    expect(buildOptions(profile, rows, roles, [{ field: 'genre', value: 'Mystery' }]).map((o) => o.column)).not.toContain('award winner');
    const c = buildCard(view(['award winner'], [{ field: 'genre', value: 'Mystery' }]), profile, rows, roles, dataset);
    expect(c.headline.text).toBe('All items sold here are non-winners.');
    expect(c.points.map((p) => p.text)).toEqual(['Carolyn Segal accounts for 84% of items sold in non-winners.']);
    expect(c.cannot[0].text).toBe('This shows what the data contains, not why.');
  });

  it('property: no card on a one-group chart states a ranking or a 100% share (Bookshop slices and generated data)', () => {
    let seen = 0;
    const assertNoRanking = (c: Card, where: string) => {
      seen++;
      for (const t of allText(c).filter((x) => x !== c.datasetLine?.text)) expect(t, where).not.toMatch(RANKING);
    };
    // Bookshop: every category chart inside every single-filter slice where it has one group,
    // for filter columns of up to 12 values (the slices a bar click can make; titles would add
    // hundreds of near-identical cards). One pass per column pair finds those slices.
    const categories = profile.columns.filter((c) => c.type === 'nominal').map((c) => c.name);
    const sliceable = profile.columns.filter((c) => c.type === 'nominal' && c.distinct <= 12).map((c) => c.name);
    for (const field of categories) {
      for (const filterField of sliceable) {
        if (field === filterField) continue;
        const groupsIn = new Map<string, Set<string>>();
        for (const r of rows) {
          if (!r[field] || !r[filterField]) continue;
          if (!groupsIn.has(r[filterField])) groupsIn.set(r[filterField], new Set());
          groupsIn.get(r[filterField])!.add(r[field]);
        }
        for (const [value, groups] of groupsIn) {
          if (groups.size !== 1) continue;
          const v = view([field], [{ field: filterField, value }]);
          const g = groupView(v, profile, rows);
          if (g?.by === 'category' && g.groups.length === 1) assertNoRanking(buildCard(v, profile, rows, roles, dataset), `${field} where ${filterField}=${value}`);
        }
      }
    }
    // Generated data: the degenerate "one group" case, and any one-group chart in the seeds.
    for (const d of [...Array.from({ length: 80 }, (_, i) => randomDataset(i + 1)), ...degenerateDatasets()]) {
      const p = profileDataset(d.columns, d.rows);
      for (const fields of d.columns.flatMap((a, i) => [[a], ...d.columns.slice(i + 1).map((b) => [a, b])])) {
        const v = view(fields);
        const g = groupView(v, p, d.rows);
        if (g?.by === 'category' && g.groups.length === 1) assertNoRanking(buildCard(v, p, d.rows, d.roles), `${d.name}, ${fields.join(' + ')}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 30_000);
});

describe('a column whose role disagrees with its name', () => {
  // "price" sounds average-only, but the contract says money (summable). Summed, store A
  // leads (40 vs 30); averaged, B would (30 vs 10). Every part of the card must use the role.
  const load = (csv: string, rolesJson: string) => {
    const r = parseCsv(csv, 'f', true);
    if (!r.ok) throw new Error();
    const pr = parseRoles(JSON.parse(rolesJson), r.dataset.columns);
    if (!pr.ok) throw new Error();
    const p = profileDataset(r.dataset.columns, r.dataset.rows);
    return buildCard({ fields: ['store', r.dataset.columns[1]], aggregate: 'sum', filters: [] }, p, r.dataset.rows, pr.roles, []);
  };
  const dir = new URL('./fixtures/synthetic-checks/', import.meta.url);
  const csv = readFileSync(new URL('role-disagrees-with-name.csv', dir), 'utf8');
  const rolesJson = readFileSync(new URL('role-disagrees-with-name.roles.json', dir), 'utf8');

  it('reads the same as a column whose name agrees with the same role, apart from the name', () => {
    const disagrees = load(csv, rolesJson);
    const agrees = load(csv.replace('price', 'revenue'), rolesJson.replace('price', 'revenue'));
    expect(disagrees.highlight).toBe('A');
    expect(JSON.stringify(disagrees)).toBe(JSON.stringify(agrees).replaceAll('revenue', 'price'));
  });
});

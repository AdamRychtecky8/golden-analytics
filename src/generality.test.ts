import { describe, expect, it } from 'vitest';
import { runChecks } from './checks';
import { datasetFindings } from './datasetFindings';
import { degenerateDatasets, mulberry32, randomDataset, type Generated } from './fixtures/generateDataset';
import { groupView } from './groups';
import { loadHighlight, rulesHighlight } from './highlight';
import { buildOptions, isEligible } from './options';
import type { ChartView } from './paths';
import { PRESETS, customPersona } from './personas';
import { profileDataset } from './profile';
import { withRoleMeasures } from './roles';

// Property tests: invariants that must hold on any dataset, not just Bookshop. The datasets
// are generated from seeds (src/fixtures/generateDataset.ts); a failure names the seed and
// the view, which rebuild the exact case.

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const datasets: Generated[] = [...SEEDS.map(randomDataset), ...degenerateDatasets()];

/** Every chart of one or two columns, summed and averaged, unfiltered and filtered to one value. */
function viewsFor(d: Generated): ChartView[] {
  const pairs = d.columns.flatMap((a, i) => [[a], ...d.columns.slice(i + 1).map((b) => [a, b])]);
  const firstValue = d.rows.find((r) => r[d.columns[0]] !== '')?.[d.columns[0]];
  const filters = [[], ...(firstValue ? [[{ field: d.columns[0], value: firstValue }]] : [])];
  return pairs.flatMap((fields) => (['sum', 'mean'] as const).flatMap((aggregate) => filters.map((f) => ({ fields, aggregate, filters: f }))));
}

/** Runs fn for every dataset and view, adding which ones to any failure. */
function forEveryView(fn: (d: Generated, view: ChartView, profile: ReturnType<typeof profileDataset>) => void) {
  for (const d of datasets) {
    const profile = profileDataset(d.columns, d.rows);
    for (const view of viewsFor(d)) {
      try {
        fn(d, view, profile);
      } catch (e) {
        throw new Error(`${d.name}, view ${JSON.stringify(view)}, roles ${d.roles.known ? 'known' : 'unknown'}: ${(e as Error).message}`);
      }
    }
  }
}

describe('generality: invariants on generated datasets', () => {
  it(`covers ${SEEDS.length} random datasets (some with roles, some without) and 10 degenerate ones`, () => {
    expect(datasets.some((d) => d.roles.known) && datasets.some((d) => !d.roles.known)).toBe(true);
  });

  it('no check throws, on any chart', () => {
    forEveryView((d, view, profile) => {
      runChecks(view, profile, d.rows, d.roles);
    });
    for (const d of datasets) datasetFindings(viewsFor(d), profileDataset(d.columns, d.rows), d.rows, d.roles);
  });

  it('an average-only measure is never summed, by roles when known and by name when not', () => {
    forEveryView((d, view, profile) => {
      const effective = withRoleMeasures(profile, d.roles);
      const g = groupView(view, effective, d.rows);
      if (g?.measure && g.measure.measure !== 'additive') expect(g.aggregate).not.toBe('sum');
      // And no finding takes a share or a total of one.
      for (const f of runChecks(view, profile, d.rows, d.roles).findings) {
        const m = (f.evidence as { measure?: string | null }).measure;
        if (m) expect(effective.columns.find((c) => c.name === m)!.measure).toBe('additive');
      }
    });
  });

  it('the same input always gives the same findings', () => {
    forEveryView((d, view, profile) => {
      expect(runChecks(view, profile, d.rows, d.roles)).toEqual(runChecks(view, profile, d.rows, d.roles));
    });
    for (const d of datasets) {
      const profile = profileDataset(d.columns, d.rows);
      expect(datasetFindings(viewsFor(d), profile, d.rows, d.roles)).toEqual(datasetFindings(viewsFor(d), profile, d.rows, d.roles));
    }
  });

  it('is not passing vacuously: every check fires, and average-only measures are asked for sums', () => {
    // Without this, a generator that made only easy data would let every invariant pass.
    const fired = new Set<string>();
    let averageAskedToSum = { roles: 0, names: 0 };
    forEveryView((d, view, profile) => {
      for (const f of runChecks(view, profile, d.rows, d.roles).findings) fired.add(`${f.id}:${f.severity}`);
      const g = groupView(view, withRoleMeasures(profile, d.roles), d.rows);
      if (view.aggregate === 'sum' && g?.measure && g.measure.measure !== 'additive') {
        averageAskedToSum = { ...averageAskedToSum, [d.roles.known ? 'roles' : 'names']: averageAskedToSum[d.roles.known ? 'roles' : 'names'] + 1 };
      }
    });
    for (const id of ['mix', 'small', 'entity']) for (const s of ['misleading', 'caveat']) expect(fired).toContain(`${id}:${s}`);
    expect(fired).toContain('concentration:caveat');
    expect(fired).toContain('fragile:caveat');
    expect(averageAskedToSum.roles).toBeGreaterThan(0);
    expect(averageAskedToSum.names).toBeGreaterThan(0);
  });

  it('the generator itself is deterministic: one seed, one dataset', () => {
    expect(randomDataset(42)).toEqual(randomDataset(42));
    expect(randomDataset(42)).not.toEqual(randomDataset(43));
  });
});

describe('generality: the highlight', () => {
  const personas = [...PRESETS, customPersona('other', 'analyst', 'just exploring')];

  it('is always eligible when any option is, and "best place to start" only when none is', () => {
    let withEligible = 0;
    let withoutEligible = 0;
    for (const d of datasets) {
      const options = buildOptions(profileDataset(d.columns, d.rows), d.rows, d.roles);
      const eligible = options.filter(isEligible).map((o) => o.id);
      eligible.length > 0 ? withEligible++ : options.length > 0 && withoutEligible++;
      for (const p of personas) {
        const h = rulesHighlight(options, p, d.roles);
        if (options.length === 0) expect(h, d.name).toBeNull();
        else if (eligible.length > 0) expect([h!.label, eligible.includes(h!.id)], `${d.name}, ${p.purpose}`).toEqual(['highlight', true]);
        else expect(h!.label, d.name).toBe('best-place-to-start');
      }
    }
    // Not vacuous: both branches happen.
    expect(withEligible).toBeGreaterThan(0);
    expect(withoutEligible).toBeGreaterThan(0);
  });

  it('stays eligible whatever the AI answers: random ids from the whole menu, eligible or not', async () => {
    const rand = mulberry32(7);
    for (const d of datasets) {
      const profile = profileDataset(d.columns, d.rows);
      const options = buildOptions(profile, d.rows, d.roles);
      const eligible = options.filter(isEligible).map((o) => o.id);
      if (eligible.length === 0) continue;
      const id = options[Math.floor(rand() * options.length)].id;
      const fetcher = async () => new Response(JSON.stringify({ ok: true, id, reason: 'A fine place to start.' }));
      const h = await loadHighlight(options, profile, personas[0], d.roles, { fetcher });
      expect(eligible, `${d.name}: AI said ${id}, got ${h!.id}`).toContain(h!.id);
    }
  });
});

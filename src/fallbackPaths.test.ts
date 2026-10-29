import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { KIND_ORDER, findStandout, ruleCandidates, topValue } from './fallbackPaths';
import { parseCsv } from './loadCsv';
import { PRESETS, customPersona } from './personas';
import { profileDataset } from './profile';
import { chartForView, finishPaths, validatePaths, type Path } from './paths';

const text = readFileSync(new URL('./data/sample-sales-synthetic.csv', import.meta.url), 'utf8');
const loaded = parseCsv(text, 'sample', true);
if (!loaded.ok) throw new Error('sample failed to parse');
const { rows } = loaded.dataset;
const profile = profileDataset(loaded.dataset.columns, rows);
const cols = (type: string) => profile.columns.filter((c) => c.type === type);

/** What the app shows when there's no AI: candidates run through the same validator. */
function fallback(persona = PRESETS[0], parent: Path | null = null): Path[] {
  const { paths } = validatePaths(ruleCandidates(profile, rows, persona, parent), { profile, rows, parent });
  return finishPaths(paths, paths.map(() => 'rules'), parent);
}

describe('top-level fallback', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('gives %s three valid paths of different kinds', (_, persona) => {
    const paths = fallback(persona);
    expect(paths).toHaveLength(3);
    expect(new Set(paths.map((p) => p.kind)).size).toBe(3);
    expect(paths.every((p) => p.source === 'rules' && p.parent === null)).toBe(true);
  });

  it('puts the kinds the persona’s purpose needs first', () => {
    expect(fallback(PRESETS[0])[0].kind).toBe('comparison'); // deciding where to invest
    expect(fallback(PRESETS[1])[0].kind).toBe('trend'); // reporting results upward: headline trend
    expect(fallback(PRESETS[3])[0].kind).toBe('outlier'); // finding problems to fix
    const explorer = customPersona('retail', 'owner', 'just exploring');
    expect(fallback(explorer).map((p) => p.kind)).toEqual(KIND_ORDER['just exploring'].slice(0, 3));
  });

  it('is deterministic', () => {
    expect(fallback()).toEqual(fallback());
  });

  it('copes with a dataset of one number column', () => {
    const one: Row[] = [{ n: '1' }, { n: '2' }, { n: '5' }];
    const p = profileDataset(['n'], one);
    const { paths } = validatePaths(ruleCandidates(p, one, PRESETS[0], null), { profile: p, rows: one, parent: null });
    expect(paths.map((x) => x.kind)).toEqual(['distribution']);
  });
});

describe('findStandout', () => {
  it('finds the group furthest from the others, computed from the rows', () => {
    const s = findStandout(rows, cols('nominal'), cols('quantitative'))!;
    // Recompute the winner's mean by hand to check the number the question rests on.
    const values = rows.filter((r) => r[s.field] === s.value).map((r) => Number(r[s.measure]));
    expect(s.mean).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length);
    expect(Math.abs(s.ratio)).toBeGreaterThan(0.2);
  });

  it('ignores groups too small to judge and needs at least three groups', () => {
    const tiny: Row[] = [
      ...Array.from({ length: 5 }, () => ({ g: 'A', v: '10' })),
      ...Array.from({ length: 5 }, () => ({ g: 'B', v: '10' })),
      { g: 'C', v: '1000' }, // one row: not enough to call it an outlier
    ];
    const p = profileDataset(['g', 'v'], tiny);
    expect(findStandout(tiny, [p.columns[0]], [p.columns[1]])).toBeNull();
  });

  it('can find a group that is unusually low', () => {
    const data: Row[] = ['A', 'B', 'C'].flatMap((g) =>
      Array.from({ length: 5 }, () => ({ g, v: g === 'C' ? '2' : '10' })),
    );
    const p = profileDataset(['g', 'v'], data);
    expect(findStandout(data, [p.columns[0]], [p.columns[1]])).toMatchObject({ value: 'C', ratio: -0.8 });
  });
});

describe('go-deeper fallback', () => {
  const [comparison] = fallback(PRESETS[0]); // "Which region has the most units?"

  it('filters the parent to its top category value', () => {
    const top = topValue(rows, 'region', 'units')!;
    const kids = fallback(PRESETS[0], comparison);
    expect(kids).toHaveLength(3);
    expect(kids.every((k) => k.filter?.field === 'region' && k.filter.value === top)).toBe(true);
    expect(new Set(kids.map((k) => k.kind)).size).toBe(3);
    expect(kids.map((k) => k.id)).toEqual(['p1.1', 'p1.2', 'p1.3']);
  });

  it('works two levels down without repeating the parent', () => {
    const child = fallback(PRESETS[0], comparison)[0];
    const grandkids = fallback(PRESETS[0], child);
    expect(grandkids.length).toBeGreaterThan(0);
    expect(grandkids.every((g) => g.parent === child.id && g.filter?.value === child.filter?.value)).toBe(true);
    expect(grandkids.some((g) => g.fields.join() === child.fields.join() && g.aggregate === child.aggregate)).toBe(false);
  });

  it('splits a parent with no category field by the first category column', () => {
    const trend = fallback(PRESETS[1])[0];
    expect(trend.kind).toBe('trend');
    expect(fallback(PRESETS[1], trend).every((k) => k.filter?.field === 'region')).toBe(true);
  });
});

describe('topValue', () => {
  it('ranks by the measure’s total, breaking ties alphabetically', () => {
    const data: Row[] = [
      { g: 'B', v: '5' },
      { g: 'A', v: '5' },
      { g: 'C', v: '1' },
      { g: 'C', v: '1' },
    ];
    expect(topValue(data, 'g', 'v')).toBe('A');
    expect(topValue(data, 'g', undefined)).toBe('C'); // most rows
  });
});

describe('fallback on the Bookshop data', () => {
  const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
  const r = parseCsv(text, 'bookshop', true);
  if (!r.ok) throw new Error('bookshop failed to parse');
  const books = r.dataset.rows;
  const bp = profileDataset(r.dataset.columns, books);
  // What the user would see: the chart's own title names the aggregate it really used.
  const sumsAnAverage = (p: Path) => /sum of (price|discount)/i.test(chartForView(p, bp, books, { highlight: null })!.title);

  it.each(PRESETS.map((p) => [p.name, p] as const))('never sums price or discount for %s, two levels deep', (_, persona) => {
    const top = validatePaths(ruleCandidates(bp, books, persona, null), { profile: bp, rows: books, parent: null }).paths;
    const tops = finishPaths(top, top.map(() => 'rules'), null);
    const kids = validatePaths(ruleCandidates(bp, books, persona, tops[0]), { profile: bp, rows: books, parent: tops[0] }).paths;
    for (const p of [...tops, ...(kids as Path[])]) expect(sumsAnAverage(p)).toBe(false);
    expect(tops.map((p) => p.question).join(' ')).not.toMatch(/most price/);
  });

  it('uses revenue, the additive measure, for the store owner’s comparison', () => {
    const [first] = validatePaths(ruleCandidates(bp, books, PRESETS[0], null), { profile: bp, rows: books, parent: null }).paths;
    expect(first).toMatchObject({ kind: 'comparison', aggregate: 'sum' });
    expect(first.fields).toContain('revenue');
  });
});

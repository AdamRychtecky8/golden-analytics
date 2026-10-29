import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { CONCENTRATION, SMALL_GROUP, isMoney, runChecks } from './checks';
import { groupView } from './groups';
import { parseCsv } from './loadCsv';
import { profileDataset } from './profile';

const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
const loaded = parseCsv(text, 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const books = loaded.dataset.rows;
const bp = profileDataset(loaded.dataset.columns, books);
const view = (fields: string[], filters: { field: string; value: string }[] = [], aggregate: 'sum' | 'mean' = 'sum') => ({
  fields,
  aggregate,
  filters,
});
const ids = (v: ReturnType<typeof view>, profile = bp, rows = books) => runChecks(v, profile, rows).map((c) => c.id);

describe('price/mix check', () => {
  it('catches hardcover vs mass-market paperback in revenue by format', () => {
    const [mix] = runChecks(view(['format', 'revenue']), bp, books).filter((c) => c.id === 'mix');
    expect(mix.text).toBe(
      'Hardcover ranks first by revenue, but Mass market paperback has the most records (26,881 vs 11,720): price, not volume, puts Hardcover on top.',
    );
    // The action: the same comparison by count, keeping any filters.
    expect(mix.countView).toEqual({ fields: ['format'], aggregate: 'sum', filters: [] });
  });

  it('catches a group that moves two places (Fiction: 3rd by revenue, 5th by records)', () => {
    const [mix] = runChecks(view(['genre', 'revenue']), bp, books).filter((c) => c.id === 'mix');
    expect(mix.text).toMatch(/ranks 3rd by revenue but 5th by records/);
  });

  it('stays quiet when the rankings agree, for means, and for counts', () => {
    expect(ids(view(['publisher', 'revenue']))).not.toContain('mix'); // same order by revenue and by count
    expect(ids(view(['format', 'price'], [], 'mean'))).not.toContain('mix'); // a mean, not a total
    expect(ids(view(['format']))).not.toContain('mix'); // already a count
  });

  it('recognises money by name', () => {
    expect(isMoney('revenue')).toBe(true);
    expect(isMoney('total_sales')).toBe(true);
    expect(isMoney('units')).toBe(false);
  });
});

describe('small-group check', () => {
  it(`flags groups with fewer than ${SMALL_GROUP} records`, () => {
    const rows: Row[] = [
      ...Array.from({ length: 40 }, () => ({ team: 'A', amount: '1' })),
      ...Array.from({ length: 12 }, () => ({ team: 'B', amount: '1' })),
    ];
    const p = profileDataset(['team', 'amount'], rows);
    const [small] = runChecks(view(['team', 'amount']), p, rows).filter((c) => c.id === 'small');
    expect(small.text).toBe(`B has only 12 records, too few to compare reliably (under ${SMALL_GROUP}).`);
  });

  it('counts small groups inside a filtered slice', () => {
    // Two filters deep, as go deeper makes them: Nonfiction hardcovers by author country.
    const slice = view(['author country', 'revenue'], [
      { field: 'genre', value: 'Nonfiction' },
      { field: 'format', value: 'Hardcover' },
    ]);
    expect(ids(slice)).toContain('small');
  });

  it('does not flag empty periods, which already show as zeros', () => {
    const rows: Row[] = [
      ...Array.from({ length: 30 }, () => ({ d: '2025-01-05', amount: '1' })),
      ...Array.from({ length: 30 }, () => ({ d: '2025-06-05', amount: '1' })),
    ];
    const p = profileDataset(['d', 'amount'], rows);
    expect(ids(view(['d', 'amount']), p, rows)).not.toContain('small');
  });
});

describe('concentration check', () => {
  it(`flags a top group with ${CONCENTRATION * 100}% or more of the total`, () => {
    const [c] = runChecks(view(['genre', 'revenue']), bp, books).filter((x) => x.id === 'concentration');
    expect(c.text).toBe('SciFi/Fantasy holds 42% of revenue, so this chart is mostly about one group.');
    expect(ids(view(['publisher']))).toContain('concentration'); // by count: 63% of records
  });

  it('stays quiet below the threshold and for means', () => {
    expect(ids(view(['format', 'revenue']))).not.toContain('concentration'); // Hardcover: 37.7%
    expect(ids(view(['genre', 'price'], [], 'mean'))).not.toContain('concentration');
  });
});

describe('groupView', () => {
  it('matches the numbers the chart draws', () => {
    const g = groupView(view(['format', 'revenue']), bp, books)!;
    const fromRows = books.filter((r) => r.format === 'Hardcover').reduce((s, r) => s + Number(r.revenue), 0);
    expect(g.groups[0].label).toBe('Hardcover');
    expect(g.groups[0].value).toBeCloseTo(fromRows, 6);
    expect(g.records).toBe(56_350);
  });

  it('never sums a price, even when asked to', () => {
    expect(groupView(view(['format', 'price']), bp, books)!.aggregate).toBe('mean');
  });

  it('has no single list of groups for a scatter', () => {
    expect(groupView(view(['price', 'revenue']), bp, books)).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { CONCENTRATION, SMALL_GROUP, isMoney, runChecks } from './checks';
import { groupView } from './groups';
import { parseCsv } from './loadCsv';
import { profileDataset } from './profile';
import { bookshopRoles, parseRoles } from './roles';

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
const ids = (v: ReturnType<typeof view>, profile = bp, rows = books) => runChecks(v, profile, rows).findings.map((c) => c.id);

describe('price/mix check', () => {
  it('catches hardcover vs mass-market paperback in revenue by format', () => {
    const [mix] = runChecks(view(['format', 'revenue']), bp, books).findings.filter((c) => c.id === 'mix');
    expect(mix.text).toBe(
      'Hardcover ranks first by revenue, but Mass market paperback has the most records (26,881 vs 11,720): price, not volume, puts Hardcover on top.',
    );
    // The action: the same comparison by count, keeping any filters.
    expect(mix.countView).toEqual({ fields: ['format'], aggregate: 'sum', filters: [] });
  });

  it('catches a group that moves two places (Fiction: 3rd by revenue, 5th by records)', () => {
    const [mix] = runChecks(view(['genre', 'revenue']), bp, books).findings.filter((c) => c.id === 'mix');
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
    const [small] = runChecks(view(['team', 'amount']), p, rows).findings.filter((c) => c.id === 'small');
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
    const [c] = runChecks(view(['genre', 'revenue']), bp, books).findings.filter((x) => x.id === 'concentration');
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

describe('severity and skips on the Bookshop data', () => {
  const run = (v: ReturnType<typeof view>) => runChecks(v, bp, books, roles);
  const roles = bookshopRoles(loaded.dataset.columns);

  it('revenue by format: mix is misleading (the #1 changes), with ranks and records as evidence', () => {
    const mix = run(view(['format', 'revenue'])).findings.find((f) => f.id === 'mix')!;
    expect(mix.severity).toBe('misleading');
    expect(mix.evidence).toEqual({
      check: 'mix',
      measure: 'revenue',
      groups: [
        { label: 'Hardcover', valueRank: 1, countRank: 2, records: 11_720 },
        { label: 'Mass market paperback', valueRank: 2, countRank: 1, records: 26_881 },
      ],
    });
  });

  it('revenue by genre: mix is only a caveat, since the #1 holds and Fiction moves', () => {
    const mix = run(view(['genre', 'revenue'])).findings.find((f) => f.id === 'mix')!;
    expect(mix.severity).toBe('caveat');
    expect(mix.evidence).toMatchObject({ groups: [{ label: 'Fiction', valueRank: 3, countRank: 5 }] });
  });

  it('count by format: only a concentration caveat, no misleading findings', () => {
    const { findings } = run(view(['format']));
    expect(findings.map((f) => [f.id, f.severity])).toEqual([['concentration', 'caveat']]);
    expect(findings[0].evidence).toMatchObject({ group: 'Mass market paperback', value: 26_881, total: 56_350 });
  });

  it('says why each check that did not run was skipped', () => {
    expect(run(view(['format'])).skipped).toContainEqual({ id: 'mix', reason: 'the chart is a count, not a sum' });
    expect(run(view(['sale date', 'revenue'])).skipped).toContainEqual({ id: 'concentration', reason: 'groups are periods, not categories' });
    expect(run(view(['format', 'price'], [], 'mean')).skipped).toContainEqual({ id: 'mix', reason: 'the chart is a mean, not a sum' });
  });

  it('never scans an id column', () => {
    const r = run(view(['book id']));
    expect(r.findings).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(r.skipped.map(() => '"book id" has the id role: ids are counted, never checked'));
  });

  it('uses the roles, not the names, when roles are known', () => {
    // Swap them: "revenue" gets the price role and "price" gets the money role.
    const cols = Object.fromEntries(loaded.dataset.columns.map((c) => [c, { role: 'category' }]));
    const pr = parseRoles({ columns: { ...cols, revenue: { role: 'price' }, price: { role: 'money' } } }, loaded.dataset.columns);
    if (!pr.ok) throw new Error();
    // Revenue is now average-only: asked for a sum, the chart is a mean, so mix skips.
    expect(runChecks(view(['format', 'revenue']), bp, books, pr.roles).skipped).toContainEqual({ id: 'mix', reason: 'the chart is a mean, not a sum' });
    // Price is now money: it is summed, and mix runs on it.
    const priced = runChecks(view(['format', 'price']), bp, books, pr.roles);
    expect(priced.skipped.map((s) => s.id)).not.toContain('mix');
  });
});

describe('driven by one entity, on the Bookshop data', () => {
  const roles = bookshopRoles(loaded.dataset.columns);
  const entityOf = (v: ReturnType<typeof view>) => runChecks(v, bp, books, roles).findings.find((f) => f.id === 'entity');

  it('revenue by genre: misleading, Bianca Thompson, and SciFi/Fantasy falls to 4th without her', () => {
    const f = entityOf(view(['genre', 'revenue']))!;
    expect(f.severity).toBe('misleading');
    expect(f.text).toBe('Bianca Thompson accounts for 79% of revenue in SciFi/Fantasy. Without that author, SciFi/Fantasy ranks 4th.');
    expect(f.evidence).toMatchObject({ column: 'author', entity: 'Bianca Thompson', group: 'SciFi/Fantasy', rankWithout: 4 });
  });

  it('revenue by award winner: misleading, "yes" ranks 2nd without Bianca Thompson', () => {
    const f = entityOf(view(['award winner', 'revenue']))!;
    expect(f.severity).toBe('misleading');
    expect(f.evidence).toMatchObject({ entity: 'Bianca Thompson', group: 'yes', rankWithout: 2 });
  });

  it('revenue by author country: a caveat (64%), since the United States stays first', () => {
    const f = entityOf(view(['author country', 'revenue']))!;
    expect(f.severity).toBe('caveat');
    expect(f.text).toBe('Bianca Thompson accounts for 64% of revenue in United States.');
  });

  it('stays quiet below half even when removing the author flips first place (count by award winner: 25%)', () => {
    expect(entityOf(view(['award winner']))).toBeUndefined();
  });

  it('stays quiet below half when the group keeps first place (count by format: 30%)', () => {
    expect(entityOf(view(['format']))).toBeUndefined();
  });

  it('skips a chart whose field determines the entity (each title has one author)', () => {
    const r = runChecks(view(['title', 'revenue']), bp, books, roles);
    expect(r.skipped).toContainEqual({ id: 'entity', reason: '"title" determines "author" (one per group), so one entity always holds its whole group' });
  });

  it('skips means', () => {
    expect(runChecks(view(['genre', 'price'], [], 'mean'), bp, books, roles).skipped.map((s) => s.id)).toContain('entity');
  });
});

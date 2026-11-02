import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { runChecks } from './checks';
import { DATASET_MIN_VIEWS, datasetFindings } from './datasetFindings';
import { parseCsv } from './loadCsv';
import { profileDataset, type DataProfile } from './profile';
import { bookshopRoles, parseRoles, roleOf, UNKNOWN_ROLES, type Roles } from './roles';
import type { ChartView } from './views';

/** Each view with its checks' findings, as datasetFindings takes them. */
const checked = (vs: ChartView[], p: DataProfile, rs: Row[], r: Roles) => vs.map((view) => ({ view, findings: runChecks(view, p, rs, r).findings }));

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);

// Every category, entity, and flag column, by revenue and by count.
const views = columns
  .filter((c) => ['category', 'entity', 'flag'].includes(roleOf(roles, c)!))
  .flatMap((c) => [
    { fields: [c, 'revenue'], aggregate: 'sum' as const, filters: [] },
    { fields: [c], aggregate: 'sum' as const, filters: [] },
  ]);

describe('datasetFindings on the Bookshop data', () => {
  const found = datasetFindings(checked(views, profile, rows, roles), rows);

  it('reports Bianca Thompson once, across the six charts she drives', () => {
    // Not the two series charts: her series has only her as author, so that finding is true
    // by definition and isn't reported (D-079).
    expect(found.map((f) => f.entity)).toEqual(['Bianca Thompson']);
    const [bianca] = found;
    expect(bianca.column).toBe('author');
    expect(bianca.views.map((v) => v.view.fields.join(' by '))).toEqual([
      'genre by revenue',
      'genre',
      'format by revenue',
      'author country by revenue',
      'author country',
      'award winner by revenue',
    ]);
    expect(bianca.views.every((v) => v.checks.includes('entity'))).toBe(true);
  });

  it("gives her share of the whole dataset's revenue and records, computed from the rows", () => {
    const [bianca] = found;
    const hers = rows.filter((r) => r.author === 'Bianca Thompson');
    const sum = (rs: Row[]) => rs.reduce((s, r) => s + Number(r.revenue), 0);
    expect(bianca.shares).toEqual([
      { measure: 'revenue', share: sum(hers) / sum(rows) },
      { measure: null, share: hers.length / rows.length },
    ]);
    expect(bianca.shares[0].share).toBeCloseTo(0.331, 3);
    expect(bianca.shares[1].share).toBeCloseTo(0.285, 3);
  });

  it(`leaves out an entity found in fewer than ${DATASET_MIN_VIEWS} charts (Carolyn Segal: one fragile lead)`, () => {
    expect(found.map((f) => f.entity)).not.toContain('Carolyn Segal');
  });

  it('finds nothing without roles, since no column is known to be an entity', () => {
    expect(datasetFindings(checked(views, profile, rows, UNKNOWN_ROLES), rows)).toEqual([]);
  });
});

describe('datasetFindings, synthetic', () => {
  it('counts a fragile-lead flip as driving a finding too', () => {
    // Synthetic: Ann tips SciFi's clear lead (37.5%, under half) in a genre chart and in a
    // store chart, so she is reported; Bob drives nothing.
    const data: Row[] = [
      ['Mystery', 'East', 'Cy', '35'],
      ['Mystery', 'East', 'Di', '30'],
      ['SciFi', 'North', 'Ann', '30'],
      ['SciFi', 'North', 'Bob', '25'],
      ['SciFi', 'North', 'Cal', '25'],
    ].map(([genre, store, author, revenue]) => ({ genre, store, author, revenue }));
    const cols = ['genre', 'store', 'author', 'revenue'];
    const r = parseRoles(
      { columns: { genre: { role: 'category' }, store: { role: 'category' }, author: { role: 'entity' }, revenue: { role: 'money' } } },
      cols,
    );
    if (!r.ok) throw new Error();
    const vs = ['genre', 'store'].map((c) => ({ fields: [c, 'revenue'], aggregate: 'sum' as const, filters: [] }));
    const found = datasetFindings(checked(vs, profileDataset(cols, data), data, r.roles), data);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ entity: 'Ann', shares: [{ measure: 'revenue', share: 30 / 145 }] });
    expect(found[0].views.map((v) => v.checks)).toEqual([['fragile'], ['fragile']]);
  });
});

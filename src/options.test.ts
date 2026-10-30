import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './loadCsv';
import { buildOptions, isEligible } from './options';
import { profileDataset } from './profile';
import { bookshopRoles, parseRoles, UNKNOWN_ROLES } from './roles';

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);

/** A synthetic fixture from src/fixtures/synthetic-checks, with its roles. */
function fixture(name: string) {
  const dir = new URL('./fixtures/synthetic-checks/', import.meta.url);
  const r = parseCsv(readFileSync(new URL(`${name}.csv`, dir), 'utf8'), name, true);
  if (!r.ok) throw new Error();
  const pr = parseRoles(JSON.parse(readFileSync(new URL(`${name}.roles.json`, dir), 'utf8')), r.dataset.columns);
  if (!pr.ok) throw new Error();
  return buildOptions(profileDataset(r.dataset.columns, r.dataset.rows), r.dataset.rows, pr.roles);
}

describe('the Bookshop menu', () => {
  const options = buildOptions(profile, rows, roles);
  const byId = (id: string) => options.find((o) => o.id === id)!;

  it('has one comparison per readable column (2 to 12 groups), two repairs, and one trend, in a fixed order', () => {
    expect(options.map((o) => o.id)).toEqual([
      'comparison:genre:revenue',
      'comparison:format:revenue',
      'comparison:format:count', // repairs the one above
      'comparison:publisher:revenue',
      'comparison:author country:revenue',
      'comparison:award winner:revenue',
      'comparison:award winner:count', // repairs the one above
      'comparison:series:revenue',
      'trend:sale date:revenue',
    ]);
    // title (56 groups), author (33), and book id (an id) are not options.
  });

  it('writes the questions from templates and the row noun', () => {
    expect(byId('comparison:format:revenue').question).toBe('Which format brings in the most revenue?');
    expect(byId('comparison:format:count').question).toBe('Which format has the most items sold?');
    expect(byId('comparison:award winner:revenue').question).toBe('How does revenue split by award winner?');
    expect(byId('comparison:award winner:count').question).toBe('How do items sold split by award winner?');
    expect(byId('trend:sale date:revenue').question).toBe('How has revenue changed over time?');
  });

  it('links each repair to the misleading option it repairs; the original stays', () => {
    expect(byId('comparison:format:count')).toMatchObject({ repairs: 'comparison:format:revenue', view: { fields: ['format'] } });
    expect(isEligible(byId('comparison:format:revenue'))).toBe(false);
    expect(isEligible(byId('comparison:format:count'))).toBe(true);
    // Genre is misleading too, but by the entity check, which knows no sturdier view.
    expect(isEligible(byId('comparison:genre:revenue'))).toBe(false);
    expect(options.some((o) => o.repairs === 'comparison:genre:revenue')).toBe(false);
  });

  it('carries facets, findings with severity, and effect sizes', () => {
    expect(byId('comparison:format:count').facet).toBe('offering');
    expect(byId('comparison:author country:revenue').facet).toBe('place');
    expect(byId('comparison:award winner:revenue').facet).toBeNull(); // a flag
    expect(byId('comparison:format:count').findings.map((f) => [f.id, f.severity])).toEqual([['concentration', 'caveat']]);
    expect(byId('trend:sale date:revenue').findings.map((f) => [f.id, f.severity])).toEqual([['cycle', 'caveat']]);
    expect(byId('comparison:format:count').effect).toBeCloseTo(3.15, 2); // effective number of formats
  });

  it('effective number of groups is 1 ÷ Σ share², from the rows', () => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.format, (counts.get(r.format) ?? 0) + 1);
    const expected = 1 / [...counts.values()].reduce((s, n) => s + (n / rows.length) ** 2, 0);
    expect(byId('comparison:format:count').effect).toBeCloseTo(expected, 10);
  });

  it('without roles: no facets, records as the noun, and money guessed by name', () => {
    const plain = buildOptions(profile, rows, UNKNOWN_ROLES);
    expect(plain.every((o) => o.facet === null)).toBe(true);
    // book id now counts as a category, but it has 56 values: not readable, so not an option.
    expect(plain.map((o) => o.id)).not.toContain('comparison:book id:revenue');
    expect(plain.find((o) => o.id === 'comparison:format:count')!.question).toBe('Which format has the most records?');
  });
});

describe('repairs come only from checks that know a sturdier view', () => {
  it('a mix-misleading option gets a count repair', () => {
    const options = fixture('mix-misleading');
    expect(options.map((o) => [o.id, o.repairs])).toEqual([
      ['comparison:format:revenue', null],
      ['comparison:format:count', 'comparison:format:revenue'],
    ]);
  });

  it('an entity-misleading option gets none', () => {
    const options = fixture('entity-misleading');
    expect(isEligible(options[0])).toBe(false);
    expect(options.every((o) => o.repairs === null)).toBe(true);
  });
});

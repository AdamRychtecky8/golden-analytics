import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './loadCsv';
import { profileDataset } from './profile';
import { bookshopRoles, currencyOf, facetOf, groupLabel, parseRoles, roleOf, rowNounOf, UNKNOWN_ROLES, withRoleMeasures } from './roles';

describe('parseRoles', () => {
  const columns = ['date', 'store', 'revenue'];

  it('accepts one known role per column, with facets and a row noun', () => {
    const r = parseRoles(
      {
        rowNoun: { one: 'order', many: 'orders' },
        columns: { date: { role: 'date' }, store: { role: 'category', facet: 'place' }, revenue: { role: 'money' } },
      },
      columns,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(roleOf(r.roles, 'revenue')).toBe('money');
    expect(facetOf(r.roles, 'store')).toBe('place');
    expect(facetOf(r.roles, 'revenue')).toBeNull();
    expect(rowNounOf(r.roles)).toEqual({ one: 'order', many: 'orders' });
  });

  it('defaults the row noun to record/records', () => {
    const r = parseRoles({ columns: { date: { role: 'date' }, store: { role: 'category' }, revenue: { role: 'money' } } }, columns);
    if (!r.ok) throw new Error();
    expect(rowNounOf(r.roles)).toEqual({ one: 'record', many: 'records' });
  });

  it('rejects a missing column, an extra column, and an unknown role, listing all of them', () => {
    const r = parseRoles({ columns: { date: { role: 'date' }, revenue: { role: 'cash' }, region: { role: 'category' } } }, columns);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        '"revenue" has an unknown role "cash". Known roles: money, price, rate, date, category, entity, flag, id.',
        '"region" has a role but isn\'t a column in the data.',
        '"store" has no role.',
      ]);
    }
  });

  it('rejects an unknown facet, and a facet on a column that is not a category or entity', () => {
    const r = parseRoles(
      { columns: { date: { role: 'date', facet: 'place' }, store: { role: 'category', facet: 'attribute' }, revenue: { role: 'money' } } },
      columns,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        '"date" has a facet, but only category or entity columns can have one (its role is date).',
        '"store" has an unknown facet "attribute". Known facets: offering, source, place.',
      ]);
    }
  });

  it('takes an optional currency symbol, and rejects one with digits or that is too long', () => {
    const cols = { date: { role: 'date' }, store: { role: 'category' }, revenue: { role: 'money' } };
    const r = parseRoles({ currency: '$', columns: cols }, columns);
    if (!r.ok) throw new Error();
    expect(currencyOf(r.roles)).toBe('$');
    const none = parseRoles({ columns: cols }, columns);
    if (!none.ok) throw new Error();
    expect(currencyOf(none.roles)).toBeNull();
    expect(parseRoles({ currency: '1$', columns: cols }, columns).ok).toBe(false);
    expect(parseRoles({ currency: 'dollars', columns: cols }, columns).ok).toBe(false);
  });

  it('names a flag column\'s groups when the contract gives labels, and falls back to "{column}: {value}"', () => {
    const cols = { date: { role: 'date' }, store: { role: 'flag', labels: { yes: 'open stores' } }, revenue: { role: 'money' } };
    const r = parseRoles({ columns: cols }, columns);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(groupLabel(r.roles, 'store', 'yes')).toBe('open stores');
    expect(groupLabel(r.roles, 'store', 'no')).toBe('store: no');
    expect(groupLabel(r.roles, 'date', 'x')).toBe('x');
    expect(parseRoles({ columns: { ...cols, revenue: { role: 'money', labels: { a: 'b' } } } }, columns).ok).toBe(false);
  });

  it('rejects a row noun without both forms', () => {
    const r = parseRoles({ rowNoun: { one: 'order' }, columns: { date: { role: 'date' }, store: { role: 'category' }, revenue: { role: 'money' } } }, columns);
    expect(r.ok).toBe(false);
  });

  it("rejects something that isn't a contract", () => {
    expect(parseRoles(['date'], columns).ok).toBe(false);
    expect(parseRoles(null, columns).ok).toBe(false);
    expect(parseRoles({ date: 'date' }, columns).ok).toBe(false); // the old flat shape
  });
});

describe('withRoleMeasures', () => {
  // "amount" sounds additive and "x" sounds like nothing; the roles say otherwise.
  const rows = [{ store: 'A', amount: '5', x: '7' }];
  const profile = profileDataset(['store', 'amount', 'x'], rows);
  const measures = (p: typeof profile) => p.columns.map((c) => c.measure);

  it('lets roles decide what can be summed when they are known', () => {
    const r = parseRoles({ columns: { store: { role: 'category' }, amount: { role: 'price' }, x: { role: 'money' } } }, ['store', 'amount', 'x']);
    if (!r.ok) throw new Error();
    expect(measures(profile)).toEqual([undefined, 'additive', 'average']); // by name
    expect(measures(withRoleMeasures(profile, r.roles))).toEqual([undefined, 'average', 'additive']); // by role
  });

  it('keeps the name-based guess without roles', () => {
    expect(withRoleMeasures(profile, UNKNOWN_ROLES)).toBe(profile);
  });
});

describe('roles for the data', () => {
  it('has no roles, no facets, and the default row noun for an uploaded CSV', () => {
    expect(roleOf(UNKNOWN_ROLES, 'revenue')).toBeNull();
    expect(facetOf(UNKNOWN_ROLES, 'store')).toBeNull();
    expect(rowNounOf(UNKNOWN_ROLES)).toEqual({ one: 'record', many: 'records' });
  });

  it('loads the Bookshop contract against its columns', () => {
    const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
    const r = parseCsv(text, 'bookshop', true);
    if (!r.ok) throw new Error();
    const roles = bookshopRoles(r.dataset.columns);
    expect(roleOf(roles, 'revenue')).toBe('money');
    expect(roleOf(roles, 'book id')).toBe('id');
    expect(['genre', 'format', 'series'].map((c) => facetOf(roles, c))).toEqual(['offering', 'offering', 'offering']);
    expect(['publisher', 'author'].map((c) => facetOf(roles, c))).toEqual(['source', 'source']);
    expect(facetOf(roles, 'author country')).toBe('place');
    expect(facetOf(roles, 'award winner')).toBeNull();
    expect(rowNounOf(roles)).toEqual({ one: 'item sold', many: 'items sold' });
  });

  it("refuses Bookshop roles for columns that don't match", () => {
    expect(() => bookshopRoles(['revenue'])).toThrow(/has a role but isn't a column/);
  });
});

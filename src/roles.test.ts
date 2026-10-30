import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './loadCsv';
import { bookshopRoles, parseRoles, roleOf, UNKNOWN_ROLES } from './roles';

describe('parseRoles', () => {
  const columns = ['date', 'store', 'revenue'];

  it('accepts one known role per column', () => {
    const r = parseRoles({ date: 'date', store: 'category', revenue: 'money' }, columns);
    expect(r.ok).toBe(true);
    if (r.ok) expect(roleOf(r.roles, 'revenue')).toBe('money');
  });

  it('rejects a missing column, an extra column, and an unknown role, listing all of them', () => {
    const r = parseRoles({ date: 'date', revenue: 'cash', region: 'category' }, columns);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        '"revenue" has an unknown role "cash". Known roles: money, price, rate, date, category, entity, flag, id.',
        '"region" has a role but isn\'t a column in the data.',
        '"store" has no role.',
      ]);
    }
  });

  it('rejects something that isn\'t an object', () => {
    expect(parseRoles(['date'], columns).ok).toBe(false);
    expect(parseRoles(null, columns).ok).toBe(false);
  });
});

describe('roles for the data', () => {
  it('has no roles for an uploaded CSV', () => {
    expect(roleOf(UNKNOWN_ROLES, 'revenue')).toBeNull();
  });

  it('loads the Bookshop roles against its columns', () => {
    const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
    const r = parseCsv(text, 'bookshop', true);
    if (!r.ok) throw new Error();
    const roles = bookshopRoles(r.dataset.columns);
    expect(roleOf(roles, 'revenue')).toBe('money');
    expect(roleOf(roles, 'author')).toBe('entity');
    expect(roleOf(roles, 'book id')).toBe('id');
  });

  it('refuses Bookshop roles for columns that don\'t match', () => {
    expect(() => bookshopRoles(['revenue'])).toThrow(/has a role but isn't a column/);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { binNumbers, parseDate, parseNumber, pickTimeUnit } from './aggregate';
import { parseCsv } from './loadCsv';
import { detectType, profileColumn, profileDataset } from './profile';

describe('parseNumber', () => {
  it('accepts plain decimals', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber(' -3.5 ')).toBe(-3.5);
    expect(parseNumber('1e3')).toBe(1000);
  });
  it('rejects anything that is not a plain number', () => {
    for (const v of ['', ' ', '$12', '1,000', 'abc', '12abc', 'NaN', 'Infinity']) {
      expect(parseNumber(v)).toBeNull();
    }
  });
});

describe('parseDate', () => {
  it('accepts ISO dates and date-times as UTC', () => {
    expect(parseDate('2025-03-14')).toBe(Date.UTC(2025, 2, 14));
    expect(parseDate('2025-03-14T09:30:00Z')).toBe(Date.UTC(2025, 2, 14, 9, 30));
    expect(parseDate('2025-03-14 09:30')).toBe(Date.UTC(2025, 2, 14, 9, 30));
  });
  it('rejects ambiguous and impossible dates', () => {
    expect(parseDate('3/14/2025')).toBeNull();
    expect(parseDate('2025-02-30')).toBeNull();
    expect(parseDate('2025')).toBeNull();
  });
});

describe('detectType', () => {
  it('detects quantitative, temporal, and nominal columns', () => {
    expect(detectType(['1', '2.5', '3'])).toBe('quantitative');
    expect(detectType(['2025-01-01', '2025-02-01'])).toBe('temporal');
    expect(detectType(['North', 'South'])).toBe('nominal');
  });
  it('ignores missing values when deciding', () => {
    expect(detectType(['1', '', '3'])).toBe('quantitative');
  });
  it('falls back to nominal when even one value does not fit', () => {
    expect(detectType(['1', '2', 'n/a'])).toBe('nominal');
  });
  it('treats an all-missing column as nominal', () => {
    expect(detectType(['', ' '])).toBe('nominal');
  });
});

describe('profileColumn', () => {
  it('counts missing values and gives a numeric range', () => {
    const p = profileColumn('units', ['4', '', '10', '6', ' ']);
    expect(p).toMatchObject({ type: 'quantitative', count: 3, missing: 2, distinct: 3, min: 4, max: 10 });
    expect(p.bins!.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('gives top values for nominal columns, largest first, ties alphabetical', () => {
    const p = profileColumn('region', ['West', 'East', 'West', 'North', 'East', 'South', 'West']);
    expect(p.topValues).toEqual([
      { value: 'West', count: 3 },
      { value: 'East', count: 2 },
      { value: 'North', count: 1 },
      { value: 'South', count: 1 },
    ]);
  });

  it('gives a date range and per-period counts that include empty periods', () => {
    const p = profileColumn('date', ['2025-01-15', '2025-03-02', '2025-07-20']);
    expect(p.type).toBe('temporal');
    expect(p.min).toBe(Date.UTC(2025, 0, 15));
    expect(p.max).toBe(Date.UTC(2025, 6, 20));
    expect(p.timeUnit).toBe('month');
    expect(p.bins).toHaveLength(7); // January through July, including the empty months
    expect(p.bins!.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('handles an all-missing column without inventing values', () => {
    const p = profileColumn('notes', ['', '']);
    expect(p).toMatchObject({ type: 'nominal', count: 0, missing: 2, distinct: 0, topValues: [] });
  });
});

describe('binNumbers', () => {
  it('places every value in exactly one bin with nice edges', () => {
    const values = [0, 3, 7, 12, 18, 25, 33, 41, 49, 50];
    const bins = binNumbers(values);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(values.length);
    expect(bins[0].x0).toBe(0);
    expect(bins[bins.length - 1].x1).toBeGreaterThanOrEqual(50);
  });
  it('handles a single repeated value', () => {
    expect(binNumbers([5, 5, 5])).toEqual([{ x0: 5, x1: 5, count: 3 }]);
  });
  it('returns no bins for no values', () => {
    expect(binNumbers([])).toEqual([]);
  });
});

describe('pickTimeUnit', () => {
  it('scales the unit with the date range', () => {
    expect(pickTimeUnit(Date.UTC(2025, 0, 1), Date.UTC(2025, 1, 15))).toBe('day');
    expect(pickTimeUnit(Date.UTC(2025, 0, 1), Date.UTC(2025, 11, 31))).toBe('month');
    expect(pickTimeUnit(Date.UTC(2015, 0, 1), Date.UTC(2025, 0, 1))).toBe('year');
  });
});

describe('parseCsv', () => {
  it('parses a clean CSV and trims header names', () => {
    const r = parseCsv('a, b\n1,x\n2,y\n', 'test.csv');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dataset.columns).toEqual(['a', 'b']);
      expect(r.dataset.rows).toEqual([{ a: '1', b: 'x' }, { a: '2', b: 'y' }]);
    }
  });
  it('rejects rows with the wrong number of fields and says which line', () => {
    const r = parseCsv('a,b\n1,x\n2\n', 'test.csv');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/line 3/);
  });
  it('rejects duplicate column names', () => {
    const r = parseCsv('a,a\n1,2\n', 'test.csv');
    expect(r.ok).toBe(false);
  });
  it('rejects a header with no data', () => {
    expect(parseCsv('a,b\n', 'test.csv').ok).toBe(false);
  });
});

describe('the bundled sample', () => {
  it('profiles as date, two categories, and two numbers with nothing missing', () => {
    const text = readFileSync(new URL('./data/sample-sales-synthetic.csv', import.meta.url), 'utf8');
    const r = parseCsv(text, 'sample', true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const profile = profileDataset(r.dataset.columns, r.dataset.rows);
    expect(profile.rowCount).toBe(200);
    expect(profile.columns.map((c) => [c.name, c.type])).toEqual([
      ['date', 'temporal'],
      ['region', 'nominal'],
      ['category', 'nominal'],
      ['units', 'quantitative'],
      ['revenue', 'quantitative'],
    ]);
    expect(profile.columns.every((c) => c.missing === 0)).toBe(true);
  });
});

describe('the Bookshop demo data (made by scripts/prepare-bookshop.py)', () => {
  const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
  const r = parseCsv(text, 'bookshop-sales.csv', true);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const { rows, columns } = r.dataset;
  const profile = profileDataset(columns, rows);
  const col = (name: string) => profile.columns.find((c) => c.name === name)!;

  it('has one row per item sold, typed as expected, with nothing missing', () => {
    expect(profile.rowCount).toBe(56_350);
    expect(profile.columns.map((c) => [c.name, c.type])).toEqual([
      ['sale date', 'temporal'],
      ['title', 'nominal'],
      ['genre', 'nominal'],
      ['format', 'nominal'],
      ['publisher', 'nominal'],
      ['author country', 'nominal'],
      ['price', 'quantitative'],
      ['discount', 'quantitative'],
      ['revenue', 'quantitative'],
    ]);
    expect(profile.columns.every((c) => c.missing === 0)).toBe(true);
  });

  it('parses its year-2193 dates in UTC and buckets them by month', () => {
    const date = col('sale date');
    expect(new Date(date.min!).toISOString().slice(0, 10)).toBe('2193-01-02');
    expect(new Date(date.max!).toISOString().slice(0, 10)).toBe('2193-12-31');
    expect(date.timeUnit).toBe('month');
    expect(date.bins).toHaveLength(12);
  });

  it('has revenue = price × (1 − discount), to the cent, on every row', () => {
    const off = rows.filter((row) => {
      const expected = Number(row.price) * (1 - Number(row.discount));
      return Math.abs(Number(row.revenue) - expected) > 0.005 + 1e-9;
    });
    expect(off).toEqual([]);
    expect(col('discount').min).toBe(0);
    expect(col('discount').max).toBeLessThan(1);
  });
});

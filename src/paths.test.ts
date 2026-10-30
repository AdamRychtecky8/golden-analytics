import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { profileDataset } from './profile';
import { chartForView, filterRows, summarizeProfile } from './paths';

const rows: Row[] = [
  { date: '2025-01-10', region: 'West', category: 'Home', units: '4', revenue: '100' },
  { date: '2025-01-20', region: 'East', category: 'Home', units: '6', revenue: '50' },
  { date: '2025-05-05', region: 'West ', category: 'Apparel', units: '2', revenue: '300' },
  { date: '2025-05-15', region: '', category: 'Home', units: '', revenue: '25' },
];
const profile = profileDataset(['date', 'region', 'category', 'units', 'revenue'], rows);

describe('filterRows', () => {
  it('keeps rows whose value matches, comparing trimmed values', () => {
    const west = filterRows(rows, [{ field: 'region', value: 'West' }]);
    expect(west.map((r) => r.revenue)).toEqual(['100', '300']);
  });

  it('never matches a missing value and returns all rows with no filter', () => {
    expect(filterRows(rows, [{ field: 'region', value: '' }])).toEqual([]);
    expect(filterRows(rows, [])).toBe(rows);
  });

  it('keeps only rows that match every filter', () => {
    const westHome = filterRows(rows, [
      { field: 'region', value: 'West' },
      { field: 'category', value: 'Home' },
    ]);
    expect(westHome.map((r) => r.revenue)).toEqual(['100']);
  });
});

describe('chartForView', () => {
  it('computes the chart from the filtered rows and says so', () => {
    const chart = chartForView(
      { fields: ['category', 'revenue'], aggregate: 'sum', filters: [{ field: 'region', value: 'West' }] },
      profile,
      rows,
      { highlight: null },
    )!;
    expect(chart.title).toBe('Sum of revenue by category · region = West');
    expect(chart.notes[0]).toBe('Only rows where region is West: 2 of 4.');
    const values = (chart.spec as any).data.values.map((v: any) => [v.category, v.value]);
    expect(values).toEqual([
      ['Apparel', 300],
      ['Home', 100],
    ]);
  });

  it('returns null for fields the dataset does not have', () => {
    expect(chartForView({ fields: ['profit'], aggregate: 'sum', filters: [] }, profile, rows, { highlight: null })).toBeNull();
  });

  it('names every filter in the chart title and note', () => {
    const chart = chartForView({ fields: ['date', 'revenue'], aggregate: 'sum', filters: [{ field: 'region', value: 'West' }, { field: 'category', value: 'Home' }] }, profile, rows, { highlight: null })!;
    expect(chart.title).toBe('Sum of revenue by month · region = West · category = Home');
    expect(chart.notes[0]).toBe('Only rows where region is West and category is Home: 1 of 4.');
  });
});

describe('summarizeProfile (what an AI handler may see)', () => {
  it('has a summary of each column and no rows', () => {
    expect(summarizeProfile(profile).columns.map((c) => Object.keys(c).sort())).toEqual([
      ['distinct', 'max', 'min', 'missing', 'name', 'type'],
      ['distinct', 'missing', 'name', 'topValues', 'type'],
      ['distinct', 'missing', 'name', 'topValues', 'type'],
      ['distinct', 'max', 'measure', 'min', 'missing', 'name', 'type'],
      ['distinct', 'max', 'measure', 'min', 'missing', 'name', 'type'],
    ]);
    // Dates go as readable ISO days. A revenue of 100 is neither the min nor the max, so it
    // can only appear if a row leaked in.
    expect(summarizeProfile(profile).columns[0]).toMatchObject({ min: '2025-01-10', max: '2025-05-15' });
    expect(JSON.stringify(summarizeProfile(profile))).not.toContain('100');
  });
});

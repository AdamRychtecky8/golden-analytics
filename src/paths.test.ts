import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { profileDataset } from './profile';
import { PRESETS } from './personas';
import {
  buildRequest,
  chartForView,
  filterRows,
  finishPaths,
  sameView,
  summarizeProfile,
  validatePaths,
  type Path,
} from './paths';

const rows: Row[] = [
  { date: '2025-01-10', region: 'West', category: 'Home', units: '4', revenue: '100' },
  { date: '2025-01-20', region: 'East', category: 'Home', units: '6', revenue: '50' },
  { date: '2025-05-05', region: 'West ', category: 'Apparel', units: '2', revenue: '300' },
  { date: '2025-05-15', region: '', category: 'Home', units: '', revenue: '25' },
];
const profile = profileDataset(['date', 'region', 'category', 'units', 'revenue'], rows);
const ctx = { profile, rows, parent: null };

const good = (over: object = {}) => ({
  question: 'Which region has the most revenue?',
  kind: 'comparison',
  fields: ['region', 'revenue'],
  aggregate: 'sum',
  filters: [],
  ...over,
});

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

describe('validatePaths: fields', () => {
  it('accepts a valid path and cleans up its question', () => {
    const { paths, rejected } = validatePaths([good({ question: '  Which region   leads? ' })], ctx);
    expect(rejected).toEqual([]);
    expect(paths).toEqual([{ ...good(), question: 'Which region leads?' }]);
  });

  it('drops a path naming a column that does not exist', () => {
    const { paths, rejected } = validatePaths([good({ fields: ['region', 'profit'] })], ctx);
    expect(paths).toEqual([]);
    expect(rejected[0]).toMatch(/no column named "profit"/);
  });

  it('drops field combinations no chart rule covers', () => {
    const { paths, rejected } = validatePaths([good({ fields: ['date', 'date'] }), good({ fields: ['region', 'units', 'revenue'] })], ctx);
    expect(paths).toEqual([]);
    expect(rejected).toHaveLength(2);
  });

  it('drops unknown kinds, bad aggregates, missing questions, and non-objects', () => {
    const { paths, rejected } = validatePaths(
      [good({ kind: 'correlation' }), good({ aggregate: 'median' }), good({ question: '' }), 'hello', null],
      ctx,
    );
    expect(paths).toEqual([]);
    expect(rejected).toHaveLength(5);
  });

  it('drops runaway questions', () => {
    const long = Array.from({ length: 30 }, () => 'why').join(' ');
    expect(validatePaths([good({ question: long })], ctx).paths).toEqual([]);
  });

  it('treats a response that is not a list as no paths', () => {
    expect(validatePaths({ paths: 'nope' }, ctx).paths).toEqual([]);
  });
});

describe('validatePaths: filters', () => {
  const trend = (filter: object) => good({ kind: 'trend', fields: ['date', 'revenue'], filters: [filter] });

  it('accepts a filter on a category column with a value that occurs', () => {
    expect(validatePaths([trend({ field: 'region', value: 'West' })], ctx).paths).toHaveLength(1);
  });

  it('drops a value that never occurs in the data', () => {
    const { rejected } = validatePaths([trend({ field: 'region', value: 'Central' })], ctx);
    expect(rejected[0]).toMatch(/never occurs/);
  });

  it('drops a filter on a number or date column', () => {
    expect(validatePaths([good({ filters: [{ field: 'units', value: '4' }] })], ctx).paths).toEqual([]);
    expect(validatePaths([good({ filters: [{ field: 'date', value: '2025-01-10' }] })], ctx).paths).toEqual([]);
  });

  it('drops a filter on a field the path also charts', () => {
    const { rejected } = validatePaths([good({ filters: [{ field: 'region', value: 'West' }] })], ctx);
    expect(rejected[0]).toMatch(/also charts/);
  });

  it('drops a filter on an unknown column or with the wrong shape', () => {
    expect(validatePaths([trend({ field: 'store', value: 'A' })], ctx).paths).toEqual([]);
    expect(validatePaths([trend({ field: 'region' })], ctx).paths).toEqual([]);
  });
});

describe('validatePaths: the set of paths', () => {
  it('keeps one path per kind', () => {
    const { paths, rejected } = validatePaths(
      [good(), good({ question: 'Which category sells most?', fields: ['category', 'units'] })],
      ctx,
    );
    expect(paths).toHaveLength(1);
    expect(rejected[0]).toMatch(/comparison path is already shown/);
  });

  it('drops a second path that would draw the same chart', () => {
    const { paths } = validatePaths([good(), good({ kind: 'outlier', fields: ['revenue', 'region'] })], ctx);
    expect(paths).toHaveLength(1);
  });

  it('keeps at most three', () => {
    const candidates = [
      good(),
      good({ kind: 'trend', fields: ['date', 'revenue'] }),
      good({ kind: 'distribution', fields: ['revenue'] }),
      good({ kind: 'driver', fields: ['units', 'revenue'] }),
    ];
    expect(validatePaths(candidates, ctx).paths.map((p) => p.kind)).toEqual(['comparison', 'trend', 'distribution']);
  });

  it('drops a follow-up that repeats its parent, even with the fields swapped', () => {
    const [parent] = finishPaths([good() as unknown as Path], ['ai'], null);
    const { paths, rejected } = validatePaths([good({ kind: 'outlier', fields: ['revenue', 'region'] })], { ...ctx, parent });
    expect(paths).toEqual([]);
    expect(rejected[0]).toMatch(/keep the parent's filters and add one/);
  });

  it('counts paths already accepted when topping up', () => {
    const already = validatePaths([good()], ctx).paths;
    const more = validatePaths([good(), good({ kind: 'trend', fields: ['date', 'revenue'] })], ctx, already);
    expect(more.paths.map((p) => p.kind)).toEqual(['trend']);
  });
});

describe('sameView', () => {
  it('ignores sum/mean for charts that do not aggregate', () => {
    const a = { fields: ['units'], aggregate: 'sum' as const, filters: [] };
    expect(sameView(a, { ...a, aggregate: 'mean' }, profile)).toBe(true);
    const bars = { fields: ['region', 'units'], aggregate: 'sum' as const, filters: [] };
    expect(sameView(bars, { ...bars, aggregate: 'mean' }, profile)).toBe(false);
  });
});

describe('finishPaths', () => {
  it('numbers paths by their place in the tree', () => {
    const top = finishPaths([good() as unknown as Path, good() as unknown as Path], ['ai', 'rules'], null);
    expect(top.map((p) => [p.id, p.parent, p.source])).toEqual([
      ['p1', null, 'ai'],
      ['p2', null, 'rules'],
    ]);
    const kids = finishPaths([good() as unknown as Path], ['rules'], top[1]);
    expect(kids[0]).toMatchObject({ id: 'p2.1', parent: 'p2' });
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
});

describe('what the AI is sent', () => {
  it('contains the profile summary and persona, and no rows', () => {
    const request = buildRequest(profile, PRESETS[0], null);
    expect(request.persona).toEqual({ domain: 'retail', role: 'owner', purpose: 'deciding where to invest' });
    expect(request.profile.columns.map((c) => Object.keys(c).sort())).toEqual([
      ['distinct', 'max', 'min', 'missing', 'name', 'type'],
      ['distinct', 'missing', 'name', 'topValues', 'type'],
      ['distinct', 'missing', 'name', 'topValues', 'type'],
      ['distinct', 'max', 'measure', 'min', 'missing', 'name', 'type'],
      ['distinct', 'max', 'measure', 'min', 'missing', 'name', 'type'],
    ]);
    // Dates go as readable ISO days. A revenue of 100 is neither the min nor the max, so it
    // can only appear if a row leaked into the request.
    expect(summarizeProfile(profile).columns[0]).toMatchObject({ min: '2025-01-10', max: '2025-05-15' });
    expect(JSON.stringify(request)).not.toContain('100');
  });

  it('sends only the parent path’s question and chart, not its id or source', () => {
    const [parent] = finishPaths([good() as unknown as Path], ['ai'], null);
    expect(Object.keys(buildRequest(profile, PRESETS[0], parent).parent!).sort()).toEqual([
      'aggregate',
      'fields',
      'filters',
      'kind',
      'question',
    ]);
  });
});

describe('validatePaths: average-only measures', () => {
  const books: Row[] = [
    { format: 'Hardcover', price: '30', revenue: '30' },
    { format: 'Paperback', price: '10', revenue: '9' },
  ];
  const p = profileDataset(['format', 'price', 'revenue'], books);
  const c = { profile: p, rows: books, parent: null };
  const path = (fields: string[], aggregate: string) => ({ question: 'Which format leads?', kind: 'comparison', fields, aggregate, filters: [] });

  it('rejects a path that sums price', () => {
    const { paths, rejected } = validatePaths([path(['format', 'price'], 'sum')], c);
    expect(paths).toEqual([]);
    expect(rejected[0]).toMatch(/sums price, which can only be averaged/);
  });

  it('accepts the mean of price and the sum of revenue', () => {
    expect(validatePaths([path(['format', 'price'], 'mean')], c).paths).toHaveLength(1);
    expect(validatePaths([path(['format', 'revenue'], 'sum')], c).paths).toHaveLength(1);
  });

  it('does not mind "sum" on a chart that does not aggregate (a histogram of price)', () => {
    expect(validatePaths([{ ...path(['price'], 'sum'), kind: 'distribution' }], c).paths).toHaveLength(1);
  });
});

describe('validatePaths: follow-ups narrow their parent (nested filters)', () => {
  const west = { field: 'region', value: 'West' };
  const home = { field: 'category', value: 'Home' };
  const trend = (filters: object[], over: object = {}) =>
    good({ question: 'How has revenue changed?', kind: 'trend', fields: ['date', 'revenue'], filters, ...over });
  const parentWith = (filters: object[], id = 'p1') =>
    ({ ...(good({ filters }) as object), id, parent: null, source: 'ai' }) as unknown as Path;

  it('accepts a follow-up that keeps the parent’s filters and adds one', () => {
    expect(validatePaths([trend([west])], { ...ctx, parent: parentWith([]) }).paths).toHaveLength(1);
    const deeper = validatePaths([trend([west, home])], { ...ctx, parent: parentWith([west], 'p1.1') });
    expect(deeper.paths[0].filters).toEqual([west, home]);
  });

  it('drops a follow-up that adds no filter, adds two, or drops the parent’s filter', () => {
    const parent = parentWith([west]);
    for (const filters of [[west], [west, home, { field: 'date', value: 'x' }], [home]]) {
      const { paths, rejected } = validatePaths([trend(filters)], { ...ctx, parent });
      expect(paths).toEqual([]);
      expect(rejected).toHaveLength(1);
    }
  });

  it('has no follow-ups below three filters', () => {
    const full = parentWith([west, home, { field: 'other', value: 'x' }]);
    expect(validatePaths([trend([west, home])], { ...ctx, parent: full }).rejected[0]).toMatch(/already has 3 filters/);
  });

  it('allows at most one filter on a top-level path', () => {
    expect(validatePaths([trend([west, home])], ctx).rejected[0]).toMatch(/at most one filter/);
  });

  it('drops a filter combination no row matches, and a field filtered twice', () => {
    const east = { field: 'region', value: 'East' };
    const apparel = { field: 'category', value: 'Apparel' };
    expect(validatePaths([trend([east, apparel])], { ...ctx, parent: parentWith([east]) }).rejected[0]).toMatch(/no rows match/);
    expect(validatePaths([trend([west, east])], { ...ctx, parent: parentWith([west]) }).rejected[0]).toMatch(/region twice/);
  });

  it('accepts the older single `filter` field as one filter', () => {
    const { paths } = validatePaths([{ ...trend([]), filters: undefined, filter: west }], ctx);
    expect(paths[0].filters).toEqual([west]);
  });

  it('names every filter in the chart title and note', () => {
    const chart = chartForView({ fields: ['date', 'revenue'], aggregate: 'sum', filters: [west, home] }, profile, rows, { highlight: null })!;
    expect(chart.title).toBe('Sum of revenue by month · region = West · category = Home');
    expect(chart.notes[0]).toBe('Only rows where region is West and category is Home: 1 of 4.');
  });
});


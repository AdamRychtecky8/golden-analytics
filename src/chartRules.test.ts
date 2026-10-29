import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { ACCENT, GREY, buildChart, canSum, chartIdeas, chartTitle, chooseRule, effectiveAggregate, usesAggregate } from './chartRules';
import { profileDataset, type ColumnProfile } from './profile';

const rows: Row[] = [
  { date: '2025-01-10', region: 'West', category: 'Home', units: '4', revenue: '100' },
  { date: '2025-01-20', region: 'East', category: 'Home', units: '6', revenue: '50' },
  { date: '2025-05-05', region: 'West', category: 'Apparel', units: '2', revenue: '300' },
  { date: '2025-05-15', region: 'North', category: 'Home', units: '', revenue: '25' },
];
const profile = profileDataset(['date', 'region', 'category', 'units', 'revenue'], rows);
const col = (name: string): ColumnProfile => profile.columns.find((c) => c.name === name)!;
const sum = { aggregate: 'sum' as const, highlight: null };

// Pulls the computed numbers back out of a spec, to check what the chart would draw.
const valuesOf = (fields: string[], options = sum): any[] =>
  (buildChart(fields.map(col), rows, options)!.spec as any).data.values;

describe('chooseRule', () => {
  it.each([
    [['temporal', 'quantitative'], 'line'],
    [['nominal', 'quantitative'], 'sorted-bars'],
    [['quantitative', 'nominal'], 'sorted-bars'],
    [['quantitative', 'quantitative'], 'scatter'],
    [['quantitative'], 'histogram'],
    [['nominal'], 'count-bars'],
    [['temporal'], 'count-line'],
    [['temporal', 'nominal'], 'count-line-by-category'],
    [['nominal', 'nominal'], 'count-heatmap'],
  ] as const)('%j → %s', (types, rule) => {
    expect(chooseRule([...types])).toBe(rule);
  });

  it('has no rule for combinations it does not cover', () => {
    expect(chooseRule(['temporal', 'temporal'])).toBeNull();
    expect(chooseRule([])).toBeNull();
  });

  it('only offers the sum/mean toggle where a number is aggregated', () => {
    expect(usesAggregate('line')).toBe(true);
    expect(usesAggregate('sorted-bars')).toBe(true);
    expect(usesAggregate('scatter')).toBe(false);
  });
});

describe('sorted bars', () => {
  it('sums by category, largest first', () => {
    expect(valuesOf(['region', 'revenue']).map((v) => [v.category, v.value])).toEqual([
      ['West', 400],
      ['East', 50],
      ['North', 25],
    ]);
  });

  it('switches to mean and labels the axis honestly', () => {
    const chart = buildChart([col('region'), col('revenue')], rows, { aggregate: 'mean', highlight: null })!;
    const spec = chart.spec as any;
    expect(spec.data.values[0]).toMatchObject({ category: 'West', value: 200, rows: 2 });
    expect(spec.encoding.x.title).toBe('Mean of revenue');
    expect(chart.title).toBe('Mean of revenue by region');
  });

  it('starts the bars at zero', () => {
    const spec = buildChart([col('region'), col('revenue')], rows, sum)!.spec as any;
    expect(spec.encoding.x.scale.zero).toBe(true);
  });

  it('says how many rows were skipped for a missing value instead of hiding them', () => {
    const chart = buildChart([col('region'), col('units')], rows, sum)!;
    expect(chart.notes).toEqual(['1 of 4 rows are not shown because region or units is missing.']);
  });

  it('combines categories past the limit into a last "Other" bar', () => {
    // "amount" is additive (profile.ts), so the bars are sums and the totals can be checked.
    const many: Row[] = Array.from({ length: 25 }, (_, i) => ({ name: `n${i}`, amount: String(i) }));
    const p = profileDataset(['name', 'amount'], many);
    const values = (buildChart(p.columns, many, sum)!.spec as any).data.values;
    expect(values).toHaveLength(20);
    expect(values[19].category).toBe('Other (6 values)');
    const total = values.reduce((s: number, v: { value: number }) => s + v.value, 0);
    expect(total).toBe(many.reduce((s, r) => s + Number(r.amount), 0)); // nothing lost
  });
});

describe('line over time', () => {
  it('sums by month and keeps empty months as 0', () => {
    expect(valuesOf(['date', 'revenue']).map((v) => v.value)).toEqual([150, 0, 0, 0, 325]);
  });

  it('leaves empty months out of a mean and says so', () => {
    const chart = buildChart([col('date'), col('revenue')], rows, { aggregate: 'mean', highlight: null })!;
    expect((chart.spec as any).data.values.map((v: any) => v.value)).toEqual([75, 162.5]);
    expect(chart.notes.join(' ')).toMatch(/3 months with no records/);
  });

  it('puts the date on x regardless of click order', () => {
    expect(chartTitle([col('revenue'), col('date')], 'sum')).toBe('Sum of revenue by month');
  });
});

describe('counts', () => {
  it('counts records per category', () => {
    expect(valuesOf(['region']).map((v) => [v.category, v.count])).toEqual([
      ['West', 2],
      ['East', 1],
      ['North', 1],
    ]);
  });

  it('counts records per month, including empty months', () => {
    expect(valuesOf(['date']).map((v) => v.count)).toEqual([2, 0, 0, 0, 2]);
  });

  it('counts per month per category, keyed by category', () => {
    const values = valuesOf(['date', 'category']);
    const home = values.filter((v) => v.category === 'Home').map((v) => v.count);
    expect(home).toEqual([2, 0, 0, 0, 1]);
    expect(values.every((v) => v.key === v.category)).toBe(true);
  });

  it('lists every heatmap cell, including empty ones', () => {
    const values = valuesOf(['region', 'category']);
    expect(values).toHaveLength(6); // 3 regions × 2 categories
    expect(values.find((v) => v.x === 'East' && v.y === 'Apparel').count).toBe(0);
    expect(values.reduce((s, v) => s + v.count, 0)).toBe(4);
  });

  it('bins a number into a histogram that accounts for every value', () => {
    const values = valuesOf(['revenue']);
    expect(values.reduce((s, v) => s + v.count, 0)).toBe(4);
  });
});

describe('scatter', () => {
  it('plots one point per distinct pair of complete values, no aggregation', () => {
    expect(valuesOf(['units', 'revenue']).map((v) => [v.x, v.y, v.count])).toEqual([
      [4, 100, 1],
      [6, 50, 1],
      [2, 300, 1],
    ]);
  });

  it('combines identical points and sizes them by their record count', () => {
    const same: Row[] = [
      { a: '1', b: '2' },
      { a: '1', b: '2' },
      { a: '1', b: '2' },
      { a: '5', b: '9' },
    ];
    const p = profileDataset(['a', 'b'], same);
    const chart = buildChart(p.columns, same, sum)!;
    const spec = chart.spec as any;
    expect(spec.data.values.map((v: any) => [v.x, v.y, v.count])).toEqual([
      [1, 2, 3],
      [5, 9, 1],
    ]);
    expect(spec.encoding.size.field).toBe('count');
    expect(chart.notes).toContain('4 records are shown as 2 points; a bigger point stands for more records.');
  });
});

describe('chart height', () => {
  it('gives each bar enough room for its label', () => {
    const many: Row[] = Array.from({ length: 20 }, (_, i) => ({ name: `n${i}` }));
    const p = profileDataset(['name'], many);
    expect((buildChart(p.columns, many, { ...sum, height: 150 })!.spec as any).height).toBe(20 * 17);
    expect((buildChart([col('region')], rows, { ...sum, height: 150 })!.spec as any).height).toBe(150);
  });
});

describe('highlight', () => {
  it('colors only the highlighted mark with the accent and the rest grey', () => {
    const spec = buildChart([col('region'), col('revenue')], rows, { aggregate: 'sum', highlight: 'West' })!.spec as any;
    expect(spec.encoding.color).toEqual({ condition: { test: 'datum.key === "West"', value: ACCENT }, value: GREY });
  });
});

describe('chartIdeas', () => {
  it('offers one idea per field when nothing is selected', () => {
    expect(chartIdeas([], profile.columns, 'sum')).toHaveLength(5);
  });

  it('offers the field alone plus each pairing when one is selected', () => {
    const ideas = chartIdeas([col('region')], profile.columns, 'sum').map((i) => i.title);
    expect(ideas).toEqual([
      'Records by region',
      'Records by month, by region',
      'Records by region and category',
      'Sum of units by region',
      'Sum of revenue by region',
    ]);
  });

  it('offers the pair plus each field alone when two are selected', () => {
    expect(chartIdeas([col('date'), col('revenue')], profile.columns, 'sum').map((i) => i.title)).toEqual([
      'Sum of revenue by month',
      'Records by month',
      'Distribution of revenue',
    ]);
  });
});

describe('every rule renders in Vega', () => {
  // Compiles each spec and draws it to SVG in Node, so a spec Vega rejects fails here
  // rather than only in the browser. Width is fixed because there's no container in Node.
  const combos = [
    ['date', 'revenue'],
    ['region', 'revenue'],
    ['units', 'revenue'],
    ['revenue'],
    ['region'],
    ['date'],
    ['date', 'category'],
    ['region', 'category'],
  ];
  it.each(combos)('%s + %s', async (...fields) => {
    const { compile } = await import('vega-lite');
    const { View, parse } = await import('vega');
    for (const highlight of [null, 'West']) {
      const chart = buildChart(fields.filter(Boolean).map(col), rows, { aggregate: 'sum', highlight })!;
      const vgSpec = compile({ ...chart.spec, width: 400 } as never).spec;
      const svg = await new View(parse(vgSpec), { renderer: 'none' }).toSVG();
      expect(svg).toContain('<svg');
    }
  });
});

describe('dates on time charts', () => {
  it.each([[['date', 'revenue']], [['date']], [['date', 'region']]])('%j labels periods in UTC, with our format', async (fields) => {
    const { compile } = await import('vega-lite');
    const vg = JSON.stringify(compile(buildChart(fields.map(col), rows, sum)!.spec as never).spec);
    // A local-time formatter would print January's bucket (UTC midnight) as "Dec 2024"
    // in US time zones. Every date label and tooltip must go through utcFormat.
    expect(vg).toContain('utcFormat(datum[\\"period\\"], \\"%b %Y\\")');
    expect(vg).not.toMatch(/timeFormat|timeMultiFormat/);
  });
});

describe('average-only measures are never summed', () => {
  const books: Row[] = [
    { format: 'Hardcover', price: '30', revenue: '30' },
    { format: 'Hardcover', price: '20', revenue: '20' },
    { format: 'Paperback', price: '10', revenue: '9' },
  ];
  const p = profileDataset(['format', 'price', 'revenue'], books);
  const [format, price, revenue] = p.columns;

  it('turns a requested sum of price into a mean, in the numbers and the title', () => {
    const chart = buildChart([format, price], books, sum)!;
    expect(chart.title).toBe('Mean of price by format');
    expect((chart.spec as any).data.values.map((v: any) => [v.category, v.value])).toEqual([
      ['Hardcover', 25],
      ['Paperback', 10],
    ]);
  });

  it('still sums an additive measure', () => {
    expect(buildChart([format, revenue], books, sum)!.title).toBe('Sum of revenue by format');
    expect(canSum([format, revenue])).toBe(true);
    expect(canSum([format, price])).toBe(false);
    expect(effectiveAggregate([format, price], 'sum')).toBe('mean');
  });

  it('never offers a sum of price in Level 1 chart ideas', () => {
    const titles = chartIdeas([], p.columns, 'sum').map((i) => i.title).concat(chartIdeas([format], p.columns, 'sum').map((i) => i.title));
    expect(titles.some((t) => /sum of price/i.test(t))).toBe(false);
    expect(titles).toContain('Mean of price by format');
  });
});


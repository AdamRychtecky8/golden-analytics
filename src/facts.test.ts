import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Row } from './aggregate';
import { computeFacts, pearson, strength, type Fact } from './facts';
import { parseCsv } from './loadCsv';
import { profileDataset } from './profile';
import { fillStory, fillTemplate, ruleStory } from './templates';

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
const byId = (facts: Fact[]) => Object.fromEntries(facts.map((f) => [f.id, f.display]));

describe('computeFacts: categories', () => {
  const facts = byId(computeFacts(view(['format', 'revenue']), bp, books));

  it('states the top group, its share, and the gap, computed from the rows', () => {
    const total = books.reduce((s, r) => s + Number(r.revenue), 0);
    const hard = books.filter((r) => r.format === 'Hardcover').reduce((s, r) => s + Number(r.revenue), 0);
    const mass = books.filter((r) => r.format === 'Mass market paperback').reduce((s, r) => s + Number(r.revenue), 0);
    expect(facts.top_item).toBe('Hardcover');
    expect(facts.top_share).toBe(`${Math.round((hard / total) * 100)}%`);
    expect(facts.second_item).toBe('Mass market paperback');
    expect(facts.gap_to_second).toBe(Math.round(hard - mass).toLocaleString('en-US'));
    expect(facts.record_count).toBe('56,350');
    expect(facts.measure).toBe('revenue');
  });

  it('carries the insight checks as facts', () => {
    expect(facts.check_mix).toMatch(/^Hardcover ranks first by revenue/);
  });

  it('says "average price" and gives no share for a mean', () => {
    const avg = byId(computeFacts(view(['format', 'price'], [], 'sum'), bp, books)); // a sum is asked for, a mean is used
    expect(avg.measure).toBe('average price');
    expect(avg.aggregate).toBe('mean');
    expect(avg.top_share).toBeUndefined();
  });

  it('names the slice when the path has filters', () => {
    const f = byId(computeFacts(view(['format', 'revenue'], [{ field: 'genre', value: 'Fiction' }]), bp, books));
    expect(f.scope).toBe('Fiction');
    expect(Number(f.record_count.replace(/,/g, ''))).toBe(books.filter((r) => r.genre === 'Fiction').length);
  });
});

describe('computeFacts: time', () => {
  it('gives first vs last period, the change, and the peak, in 2193 months', () => {
    const f = byId(computeFacts(view(['sale date', 'revenue']), bp, books));
    expect(f.first_period).toBe('Jan 2193');
    expect(f.last_period).toBe('Dec 2193');
    expect(f.direction).toMatch(/^(rose|fell|held steady)$/);
    expect(f.change_pct).toMatch(/^[+−]?\d+%$/);
    expect(f.peak_period).toMatch(/2193$/);
  });

  it('computes the change from the monthly sums', () => {
    const rows: Row[] = [
      { d: '2025-01-10', amount: '100' },
      { d: '2025-02-10', amount: '50' },
      { d: '2025-04-25', amount: '150' }, // over 90 days after the first date, so months
    ];
    const p = profileDataset(['d', 'amount'], rows);
    const f = byId(computeFacts(view(['d', 'amount']), p, rows));
    expect([f.first_value, f.last_value, f.change, f.change_pct, f.direction]).toEqual(['100', '150', '+50.00', '+50%', 'rose']);
    expect([f.peak_period, f.low_period]).toEqual(['Apr 2025', 'Mar 2025']); // March: no sales, a real 0
  });
});

describe('computeFacts: other charts', () => {
  it('gives quartiles for a distribution and a correlation for two numbers', () => {
    const d = byId(computeFacts(view(['price']), bp, books));
    expect(Number(d.p25)).toBeLessThanOrEqual(Number(d.median_value));
    const s = byId(computeFacts(view(['price', 'revenue']), bp, books));
    expect(Number(s.correlation)).toBeGreaterThan(0.9); // revenue is price minus a small discount
    expect(s.strength).toBe('strong positive');
  });

  it('computes Pearson correlation', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('ranks paths with checks above paths without', () => {
    const withCheck = computeFacts(view(['format', 'revenue']), bp, books);
    const plain = computeFacts(view(['sale date', 'revenue']), bp, books);
    expect(strength(withCheck)).toBeGreaterThan(strength(plain));
  });
});

describe('fillTemplate', () => {
  const facts: Fact[] = [
    { id: 'top_item', label: '', display: 'Hardcover' },
    { id: 'top_share', label: '', display: '38%' },
    { id: 'measure', label: '', display: 'revenue' },
  ];

  it('fills every slot from the facts', () => {
    expect(fillTemplate('{top_item} drives {top_share} of {measure}', facts, 20)).toEqual({
      ok: true,
      text: 'Hardcover drives 38% of revenue',
      slots: ['top_item', 'top_share', 'measure'],
    });
  });

  it('rejects a slot that is not a fact', () => {
    expect(fillTemplate('{top_item} grew {growth}', facts, 20)).toEqual({ ok: false, reason: 'unknown slot {growth}' });
  });

  it('rejects any digit the AI wrote itself, even a plausible one', () => {
    for (const t of ['{top_item} drives 38% of {measure}', 'Top 3 formats', '{top_item} leads in 2193']) {
      const r = fillTemplate(t, facts, 20);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/digit/);
    }
  });

  it('rejects stray braces, empty text, and text that runs long', () => {
    expect(fillTemplate('{top_item drives}', facts, 20).ok).toBe(false);
    expect(fillTemplate('', facts, 20).ok).toBe(false);
    expect(fillTemplate(42, facts, 20).ok).toBe(false);
    expect(fillTemplate('{top_item} is a very good format indeed', facts, 3).ok).toBe(false);
  });

  it('capitalizes the first letter after filling', () => {
    const r = fillTemplate('{measure} is led by {top_item}', facts, 20);
    expect(r.ok && r.text).toBe('Revenue is led by Hardcover');
  });
});

describe('rule-based stories (no AI)', () => {
  it('writes a true card from the facts, mentioning the price/mix check', () => {
    const story = ruleStory(computeFacts(view(['format', 'revenue']), bp, books));
    expect(story.title).toBe('Hardcover leads revenue by format');
    expect(story.takeaway).toMatch(/^Hardcover brings in \d+% of revenue\. Hardcover ranks first by revenue, but Mass market paperback/);
  });

  it('writes a time story and a scoped title for a filtered path', () => {
    const t = ruleStory(computeFacts(view(['sale date', 'revenue'], [{ field: 'genre', value: 'Fiction' }]), bp, books));
    expect(t.title).toMatch(/^Revenue (rose|fell|held steady) from Jan 2193 to Dec 2193 \(Fiction\)$/);
  });

  it('every number in a rule story comes from a fact', () => {
    const facts = computeFacts(view(['genre', 'revenue']), bp, books);
    const story = ruleStory(facts);
    const fromFacts = story.slots.map((id) => facts.find((f) => f.id === id)!.display).join(' ');
    for (const n of `${story.title} ${story.takeaway}`.match(/\d[\d,.]*/g) ?? []) expect(fromFacts).toContain(n);
  });

  it('fillStory reports which part failed', () => {
    const facts = computeFacts(view(['format', 'revenue']), bp, books);
    expect(fillStory('{top_item} wins', 'It made 5 times more', facts)).toEqual({
      error: 'takeaway: a digit outside a slot (numbers must come from facts)',
    });
  });
});

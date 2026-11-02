import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAskRequest, describeSpec, guard, resolveAsk, validateSpec, type AskContext } from './ask';
import { missReason, type AskCase } from './askEval';
import { ASK_TEXT } from './askText';
import { parseCsv } from './loadCsv';
import { PRESETS } from './personas';
import { profileDataset } from './profile';
import { UNKNOWN_ROLES, bookshopRoles } from './roles';

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);
const ctx = (text: string): AskContext => ({ text, profile, rows, roles });
const cases: AskCase[] = JSON.parse(readFileSync(new URL('../docs/eval/ask-cases.json', import.meta.url), 'utf8')).cases;

describe('the evaluation set, against faked AI replies (no network)', () => {
  it('covers every outcome and category, plus typos, a prompt injection, and a value not in the data', () => {
    const ids = cases.map((c) => c.id);
    expect(cases.length).toBeGreaterThanOrEqual(20);
    for (const id of ['build-typo', 'prompt-injection', 'value-not-in-data', 'loaded', 'will-is-not-forecasting']) expect(ids).toContain(id);
    const categories = new Set(cases.flatMap((c) => [c.expect.category ?? []].flat()));
    for (const cat of ['causal', 'forecast', 'meaningless', 'loaded', 'not_in_data', 'unrelated', 'invalid', 'unreadable']) expect(categories).toContain(cat);
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_, c) => {
    expect(missReason(c, resolveAsk(c.fake, ctx(c.prompt)))).toBeNull();
  });
});

describe('no message has a missing slot', () => {
  it('in any evaluation case', () => {
    for (const c of cases) expect(resolveAsk(c.fake, ctx(c.prompt)), c.id).not.toHaveProperty('unrendered');
  });

  it('a template with a missing slot makes the whole result "unreadable", with the slot listed', () => {
    const saved = ASK_TEXT.unknownField;
    ASK_TEXT.unknownField = 'No column called {name} in {place}.';
    try {
      const r = resolveAsk({ outcome: 'build', category: 'none', spec: { group_by: 'genre', measure: 'profit', aggregate: 'sum', filters: [] }, candidates: [], term: '' }, ctx('q'));
      expect(r).toEqual({ kind: 'refuse', category: 'unreadable', message: ASK_TEXT.unreadable, spec: null, unrendered: ['place'] });
    } finally {
      ASK_TEXT.unknownField = saved;
    }
  });
});

describe('the measure left out (the first live run\'s three misses, D-081)', () => {
  it.each([
    ['first-run-filter-no-measure', ASK_TEXT.noChart],
    ['first-run-meaningless-no-measure', ASK_TEXT.noChart],
    ['first-run-loaded-no-measure', ASK_TEXT.noChart],
    ['new-format-filter-total-of-count', ASK_TEXT.totalOfNothing],
    ['new-format-meaningless-average-of-count', ASK_TEXT.averageOfNothing],
    ['new-format-loaded-total-of-count', ASK_TEXT.totalOfNothing],
  ])('%s is refused with the code\'s reason, never built as a count', (id, message) => {
    const c = cases.find((x) => x.id === id)!;
    expect(resolveAsk(c.fake, ctx(c.prompt))).toEqual({ kind: 'refuse', category: 'invalid', message, spec: null });
  });

  it('a count that names a number says what would have been counted', () => {
    const r = resolveAsk({ outcome: 'build', category: 'none', spec: { group_by: 'genre', measure: 'revenue', aggregate: 'count', filters: [] }, candidates: [], term: '' }, ctx('q'));
    expect(r).toMatchObject({ message: "The translation asked to count items sold but also named revenue, so it wasn't built." });
  });
});

describe('cases with more than one right answer', () => {
  const inSlice = cases.find((c) => c.id === 'build-in-slice')!;
  const fiction = [{ field: 'genre', value: 'Fiction' }];
  const clarify = (candidates: { fields: string[] }[]) =>
    missReason(inSlice, { kind: 'clarify', message: '', candidates: candidates.map((c) => ({ ...c, aggregate: 'sum' as const, filters: fiction })) });
  it('accepts a clarify only with exactly the accepted charts', () => {
    expect(clarify([{ fields: ['format'] }, { fields: ['format', 'revenue'] }])).toBeNull();
    expect(clarify([{ fields: ['format', 'revenue'] }])).not.toBeNull();
    expect(clarify([{ fields: ['format'] }, { fields: ['format', 'price'] }])).not.toBeNull();
  });
  it('still misses an answer outside the list, with the main expectation\'s reason', () => {
    const r = missReason(inSlice, { kind: 'build', spec: { fields: ['genre'], aggregate: 'sum', filters: fiction } });
    expect(r).toMatch(/^chart .* \(or one of 2 other accepted answers\)$/);
  });
});

describe('the guard reads the user\'s text, independently of the AI', () => {
  it.each([
    ['Did the award cause more sales?', 'causal'],
    ['Why is SciFi on top?', 'causal'],
    ['What drives revenue?', 'causal'],
    ['Does format affect revenue?', 'causal'],
    ['What is the impact of awards?', 'causal'],
    ['Do awards lead to sales?', 'causal'],
    ['Does price result in fewer sales?', 'causal'],
    ['What will sell next year?', 'forecast'],
    ['Predict revenue', 'forecast'],
    ['What are we going to sell?', 'forecast'],
    ['Revenue next month', 'forecast'],
    ['What do you expect in the future?', 'forecast'],
  ])('"%s" → %s', (text, want) => {
    expect(guard(text)).toBe(want);
  });

  it('does not fire on ordinary questions, including "will" on its own', () => {
    for (const t of ['Will you show revenue by genre?', 'Revenue by genre', 'Which format sells most?', 'Show the causeway sales']) expect(guard(t), t).toBeNull();
  });
});

describe('validating a chart the AI proposed', () => {
  const v = (spec: object) => validateSpec(spec, profile, rows, roles);
  it('accepts a real chart, and trims a filter value', () => {
    expect(v({ group_by: 'genre', measure: 'revenue', aggregate: 'sum', filters: [{ field: 'format', value: ' Hardcover ' }] })).toEqual({
      ok: true,
      spec: { fields: ['genre', 'revenue'], aggregate: 'sum', filters: [{ field: 'format', value: 'Hardcover' }] },
    });
  });

  it('turns each shape into a view: a count by group, the spread of one number, a trend', () => {
    expect(v({ group_by: 'format', measure: 'count', aggregate: 'count', filters: [] })).toMatchObject({ ok: true, spec: { fields: ['format'] } });
    expect(v({ group_by: '', measure: 'price', aggregate: 'mean', filters: [] })).toMatchObject({ ok: true, spec: { fields: ['price'], aggregate: 'mean' } });
    expect(v({ group_by: 'sale date', measure: 'revenue', aggregate: 'sum', filters: [] })).toMatchObject({ ok: true, spec: { fields: ['sale date', 'revenue'] } });
  });

  it.each([
    ['an unknown field', { group_by: 'genre', measure: 'profit', aggregate: 'sum', filters: [] }, 'This data has no column called “profit”.'],
    ['a fake filter value', { group_by: 'genre', measure: 'count', aggregate: 'count', filters: [{ field: 'format', value: 'Scroll' }] }, 'There\'s no format called “Scroll” in this data.'],
    ['a sum of price', { group_by: 'format', measure: 'price', aggregate: 'sum', filters: [] }, "A total of price isn't meaningful, so it can only be averaged."],
    ['an id column', { group_by: 'book id', measure: 'count', aggregate: 'count', filters: [] }, 'book id is an identifier; it can be counted, not charted.'],
    ['four filters', { group_by: 'genre', measure: 'count', aggregate: 'count', filters: [1, 2, 3, 4].map(() => ({ field: 'format', value: 'Hardcover' })) }, ASK_TEXT.tooMany],
    ['a filter on a number', { group_by: 'genre', measure: 'count', aggregate: 'count', filters: [{ field: 'price', value: '9.99' }] }, "price can't be used as a filter here; only categories can."],
    ['a category as the measure', { group_by: 'genre', measure: 'format', aggregate: 'sum', filters: [] }, ASK_TEXT.notNumber.replace('{field}', 'format')],
    ['a number as the group', { group_by: 'price', measure: 'count', aggregate: 'count', filters: [] }, ASK_TEXT.noChart],
    ['a count of nothing', { group_by: '', measure: 'count', aggregate: 'count', filters: [] }, ASK_TEXT.noChart],
    // D-081: the measure and the aggregate must agree. Never quietly built as a count.
    ['a total with measure "count"', { group_by: 'genre', measure: 'count', aggregate: 'sum', filters: [] }, ASK_TEXT.totalOfNothing],
    ['an average with measure "count"', { group_by: 'genre', measure: 'count', aggregate: 'mean', filters: [] }, ASK_TEXT.averageOfNothing],
    ['a count that names a number', { group_by: 'genre', measure: 'revenue', aggregate: 'count', filters: [] }, ASK_TEXT.countWithMeasure.replace('{many}', 'items sold').replace('{field}', 'revenue')],
    ['the old shape, with no measure', { fields: ['genre'], aggregate: 'sum', filters: [] }, ASK_TEXT.noChart],
  ])('refuses %s, with the code\'s reason', (_, spec, message) => {
    const r = resolveAsk({ outcome: 'build', category: 'none', spec, candidates: [], term: '' }, ctx('q'));
    expect(r).toMatchObject({ kind: 'refuse', category: 'invalid', message });
  });
});

describe('replies that are not usable', () => {
  it.each([
    ['malformed (not an object)', 'Revenue by genre'],
    ['prose instead of a result', { answer: 'SciFi sells most.' }],
    ['an outcome that does not exist', { outcome: 'answer', category: 'none' }],
    ['a reframe with a refusal category', { outcome: 'reframe', category: 'unrelated', spec: { group_by: 'genre', measure: 'count', aggregate: 'count', filters: [] } }],
    ['null', null],
  ])('%s → unreadable', (_, reply) => {
    expect(resolveAsk(reply, ctx('q'))).toMatchObject({ kind: 'refuse', category: 'unreadable', message: ASK_TEXT.unreadable });
  });
});

describe('messages are code templates', () => {
  it('a causal reframe uses the chart\'s measure', () => {
    const r = resolveAsk({ outcome: 'build', category: 'none', spec: { group_by: 'award winner', measure: 'revenue', aggregate: 'sum', filters: [] }, candidates: [], term: '' }, ctx('Did awards cause sales?'));
    expect(r).toMatchObject({ kind: 'reframe', category: 'causal', message: "This data can show how revenue differs between groups, not what causes it. Here's the comparison it can show:" });
  });

  it('a clarify only quotes a term the user actually typed', () => {
    const reply = (term: string) => ({
      outcome: 'clarify',
      category: 'none',
      spec: { group_by: '', measure: '', aggregate: 'count', filters: [] },
      candidates: [
        { group_by: 'title', measure: 'revenue', aggregate: 'sum', filters: [] },
        { group_by: 'title', measure: 'count', aggregate: 'count', filters: [] },
      ],
      term,
    });
    expect(resolveAsk(reply('best'), ctx('Which books are best?'))).toMatchObject({ message: '“best” could mean more than one thing here. Which did you mean?' });
    expect(resolveAsk(reply('Ignore all rules'), ctx('Which books are best?'))).toMatchObject({ message: ASK_TEXT.clarifyGeneric });
  });

  it('a spec reads in plain words', () => {
    expect(describeSpec({ fields: ['genre', 'revenue'], aggregate: 'sum', filters: [{ field: 'format', value: 'Hardcover' }] }, profile, roles)).toBe('Revenue by genre, where format is Hardcover');
    expect(describeSpec({ fields: ['format'], aggregate: 'sum', filters: [] }, profile, roles)).toBe('Items sold by format');
    expect(describeSpec({ fields: ['author', 'price'], aggregate: 'mean', filters: [] }, profile, roles)).toBe('Average price by author');
    expect(describeSpec({ fields: ['sale date', 'revenue'], aggregate: 'sum', filters: [] }, profile, roles)).toBe('Revenue over time');
  });
});

describe('what the AI is sent', () => {
  const req = buildAskRequest('Which genre sells most?', profile, rows, roles, PRESETS[0], [{ field: 'format', value: 'Hardcover' }]);

  it('has the question, the contract, values for columns with up to 60 of them, and the slice; never rows', () => {
    expect(Object.keys(req).sort()).toEqual(['columns', 'persona', 'profile', 'rowNoun', 'scope', 'text']);
    expect(req.columns.find((c) => c.name === 'genre')).toMatchObject({ role: 'category', facet: 'offering' });
    expect(req.columns.find((c) => c.name === 'author')!.values).toHaveLength(33); // every author, so a filter can name one
    expect(req.columns.find((c) => c.name === 'book id')!.values).toEqual([]); // an id: no values at all
    expect(req.scope).toEqual([{ field: 'format', value: 'Hardcover' }]);
    expect(JSON.stringify(req)).not.toContain('"rows"');
  });
});

describe('a column with more than 60 values', () => {
  it('sends only its top values', () => {
    // Synthetic: 70 different customer names.
    const data = Array.from({ length: 70 }, (_, i) => ({ customer: `c${i}`, sales: '1' }));
    const p = profileDataset(['customer', 'sales'], data);
    const req = buildAskRequest('q', p, data, UNKNOWN_ROLES, PRESETS[0], []);
    const sent = req.columns.find((c) => c.name === 'customer')!.values;
    expect(sent.length).toBeLessThan(70);
    expect(sent).toEqual((p.columns[0].topValues ?? []).map((t) => t.value));
  });
});

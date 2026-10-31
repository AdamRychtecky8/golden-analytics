import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './aiRequest';
import { buildCard } from './card';
import { CARD_AI_NOTICES, buildCardAiRequest, checkAiBlocks, loadCardPhrasing, rephrasableBlocks, shownText } from './cardAi';
import { datasetFindings } from './datasetFindings';
import { parseCsv } from './loadCsv';
import { buildOptions } from './options';
import { PRESETS } from './personas';
import { profileDataset } from './profile';
import { bookshopRoles } from './roles';

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);
const dataset = datasetFindings(buildOptions(profile, rows, roles).map((o) => o.view), profile, rows, roles);
const view = (fields: string[]) => ({ fields, aggregate: 'sum' as const, filters: [] });
const publisher = buildCard(view(['publisher', 'revenue']), profile, rows, roles, dataset);
const format = buildCard(view(['format', 'revenue']), profile, rows, roles, dataset);

describe('what the AI may rephrase', () => {
  it('only Key talking points and If they ask; never a locked headline, a caution, or the can\'t-tell line', () => {
    const ids = rephrasableBlocks(format).map((b) => b.id);
    expect(ids).not.toContain('headline'); // locked: it stands in for the caution
    expect(ids.some((id) => id.startsWith('caution'))).toBe(false);
    expect(ids.some((id) => id.startsWith('cannot'))).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(['point.0', 'ask.0.q', 'ask.0.a']));
    expect(rephrasableBlocks(publisher).map((b) => b.id)).toContain('headline'); // no caution: the AI may reword it
  });

  it('sends templates and only the facts they use: no rows, no cautions', () => {
    const req = buildCardAiRequest(format, 'Which format brings in the most revenue?', profile, PRESETS[0]);
    expect(Object.keys(req).sort()).toEqual(['blocks', 'facts', 'persona', 'profile', 'question']);
    const used = new Set(rephrasableBlocks(format).flatMap((b) => b.slots));
    expect(req.facts.every((f) => used.has(f.id))).toBe(true);
    expect(JSON.stringify(req)).not.toContain('best-selling'); // the caution claim never goes
  });
});

describe('checking the AI blocks', () => {
  const point = publisher.points[0]; // "{conc_group} alone accounts for {conc_share} of {measure}; the other {conc_others} share the rest."

  it('accepts a rewording with the same slots', () => {
    const t = '{conc_group} by itself makes up {conc_share} of {measure}; the remaining {conc_others} split the rest.';
    expect(checkAiBlocks({ blocks: [{ id: point.id, template: t }] }, publisher)).toEqual({
      texts: { [point.id]: 'Etaoin Shrdlu Press by itself makes up 71% of revenue; the remaining 3 split the rest.' },
      rejected: [],
    });
  });

  it.each([
    ['a digit of its own', '{conc_group} makes up {conc_share} of {measure}, about 3 in 4; the other {conc_others} share the rest.'],
    ['an unknown slot', '{conc_group} makes up {conc_share} of {profit}; the other {conc_others} share the rest.'],
    ['too long', `{conc_group} makes up {conc_share} of {measure}; the other {conc_others} share the rest ${'and more '.repeat(40)}.`],
    ['a dropped slot', '{conc_group} makes up most of {measure}; the other {conc_others} share the rest.'],
  ])('falls back to the code wording for %s', (_, template) => {
    const { texts, rejected } = checkAiBlocks({ blocks: [{ id: point.id, template }] }, publisher);
    expect(texts).toEqual({});
    expect(rejected).toHaveLength(1);
  });

  it('ignores a block it was never sent, like the locked headline or a caution', () => {
    const { texts } = checkAiBlocks({ blocks: [{ id: 'headline', template: '{mix_top} is our top {field}.' }, { id: 'caution.Hardcover.claim', template: 'x' }] }, format);
    expect(texts).toEqual({});
  });
});

describe('loadCardPhrasing', () => {
  const fake = (body: object): Fetcher => vi.fn(async () => Response.json(body));

  it('says so quietly when there is no key', async () => {
    expect(await loadCardPhrasing(publisher, 'q', profile, PRESETS[0], { fetcher: fake({ ok: false, reason: 'no-key' }) })).toEqual({ texts: {}, notice: CARD_AI_NOTICES.noKey });
  });

  it('keeps what passes and notes what did not', async () => {
    const good = { id: 'point.1', template: 'The runner-up is {second_item}, at {second_amount}.' };
    const bad = { id: 'point.0', template: 'Over 70 percent is {conc_group}.' };
    const r = await loadCardPhrasing(publisher, 'q', profile, PRESETS[0], { fetcher: fake({ ok: true, blocks: [good, bad] }) });
    expect(r.texts).toEqual({ 'point.1': 'The runner-up is Cedar House Publishers, at 99,417 in revenue.' });
    expect(r.notice).toBe(CARD_AI_NOTICES.partial);
  });
});

describe('what a block shows', () => {
  const b = publisher.points[0];
  it('the user\'s edit wins over the AI, and the AI over the code, so a late AI reply never replaces an edit', () => {
    expect(shownText(b, {}, {})).toEqual({ text: b.text, from: 'code' });
    expect(shownText(b, { [b.id]: 'AI words' }, {})).toEqual({ text: 'AI words', from: 'ai' });
    expect(shownText(b, { [b.id]: 'AI words' }, { [b.id]: 'My words' })).toEqual({ text: 'My words', from: 'user' });
  });

  it('a locked block never shows AI text', () => {
    expect(shownText(format.headline, { headline: 'Hardcover is our top format.' }, {})).toEqual({ text: format.headline.text, from: 'code' });
  });
});

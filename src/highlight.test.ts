import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './aiRequest';
import { HIGHLIGHT_NOTICES, MAX_REASON_CHARS, REASONS, checkAiPick, highlightKey, loadHighlight, rulesHighlight, type Highlight } from './highlight';
import { parseCsv } from './loadCsv';
import { buildOptions, isEligible } from './options';
import { PRESETS, customPersona, type Persona } from './personas';
import { profileDataset } from './profile';
import { bookshopRoles, parseRoles } from './roles';

const loaded = parseCsv(readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8'), 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const { columns, rows } = loaded.dataset;
const profile = profileDataset(columns, rows);
const roles = bookshopRoles(columns);
const options = buildOptions(profile, rows, roles);
const storeOwner = PRESETS.find((p) => p.id === 'store-owner')!;
const eligibleIds = options.filter(isEligible).map((o) => o.id);

/** A fake network: answers every request with this body, and records what was sent. */
function fakeAi(body: Record<string, unknown>) {
  const sent: unknown[] = [];
  const fetcher = vi.fn<Fetcher>(async (_url, init) => {
    sent.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify(body));
  });
  return { fetcher, sent };
}
const noKey = () => fakeAi({ ok: false, reason: 'no-key' });
const ask = (persona: Persona, body: Record<string, unknown>) => loadHighlight(options, profile, persona, roles, { fetcher: fakeAi(body).fetcher, retryDelayMs: 0 });

describe('Bookshop, store owner, no API key', () => {
  it('keeps revenue by format in the menu but highlights its repair, format by items sold', async () => {
    const h = (await loadHighlight(options, profile, storeOwner, roles, { fetcher: noKey().fetcher }))!;
    expect(options.map((o) => o.id)).toContain('comparison:format:revenue');
    expect(h).toEqual<Highlight>({
      id: 'comparison:format:count',
      label: 'highlight',
      reason: 'It compares by format, which fits deciding where to invest. It counts items sold instead of revenue, because revenue by format is misleading.',
      source: 'rules',
      notice: HIGHLIGHT_NOTICES.noKey,
    });
    expect(h.id).not.toBe('comparison:author country:revenue');
  });
});

describe('the rules highlight per persona: kind first, then facet, then effect, then menu order', () => {
  it.each([
    ['store-owner', 'comparison:format:count'], // comparison first; offering
    ['marketing-analyst', 'trend:sale date:revenue'], // trend first
    ['researcher', 'trend:sale date:revenue'], // trend before comparison in its kind order
    ['program-manager', 'trend:sale date:revenue'], // trend before comparison in its kind order
  ])('%s → %s', (id, expected) => {
    expect(rulesHighlight(options, PRESETS.find((p) => p.id === id)!, roles)!.id).toBe(expected);
  });

  it('just exploring → the trend, with the kind reason', () => {
    const h = rulesHighlight(options, customPersona('retail', 'owner', 'just exploring'), roles)!;
    expect(h).toMatchObject({ id: 'trend:sale date:revenue', reason: 'A trend fits just exploring.' });
  });

  it('is always eligible on Bookshop', () => {
    for (const p of PRESETS) expect(eligibleIds).toContain(rulesHighlight(options, p, roles)!.id);
  });
});

describe('nothing eligible', () => {
  it('picks the least flagged option as "best place to start", without asking the AI', async () => {
    // Synthetic, 7 rows: every group is under 30 records, so both options (genre, author) are
    // misleading by the small-group check; genre is also misleading by the entity check. No
    // repairs. Least flagged: author by revenue (one misleading finding against two).
    const dir = new URL('./fixtures/synthetic-checks/', import.meta.url);
    const r = parseCsv(readFileSync(new URL('entity-misleading.csv', dir), 'utf8'), 'f', true);
    if (!r.ok) throw new Error();
    const pr = parseRoles(JSON.parse(readFileSync(new URL('entity-misleading.roles.json', dir), 'utf8')), r.dataset.columns);
    if (!pr.ok) throw new Error();
    const opts = buildOptions(profileDataset(r.dataset.columns, r.dataset.rows), r.dataset.rows, pr.roles);
    expect(opts.filter(isEligible)).toEqual([]);
    const { fetcher } = fakeAi({ ok: true, id: opts[0].id, reason: 'Pick me.' });
    const h = await loadHighlight(opts, profileDataset(r.dataset.columns, r.dataset.rows), storeOwner, pr.roles, { fetcher });
    const misleading = (id: string) => opts.find((o) => o.id === id)!.findings.filter((f) => f.severity === 'misleading').map((f) => f.id);
    expect(misleading('comparison:genre:revenue')).toEqual(['small', 'entity']);
    expect(misleading('comparison:author:revenue')).toEqual(['small']);
    expect(h).toMatchObject({ id: 'comparison:author:revenue', label: 'best-place-to-start', reason: REASONS.bestPlace, source: 'rules' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('the AI pick, and every way it falls back', () => {
  it('accepts an eligible id with a short reason and no digits', async () => {
    const h = await ask(storeOwner, { ok: true, id: 'comparison:author country:revenue', reason: 'Where your authors live shows where readers find you.' });
    expect(h).toEqual({ id: 'comparison:author country:revenue', label: 'highlight', reason: 'Where your authors live shows where readers find you.', source: 'ai', notice: null });
  });

  it.each([
    ['an ineligible id', { id: 'comparison:format:revenue', reason: 'Hardcover leads.' }],
    ['an id not in the menu', { id: 'comparison:profit:revenue', reason: 'Profit matters.' }],
    ['a digit in the reason', { id: 'trend:sale date:revenue', reason: 'Sales peak in month 7.' }],
    ['a reason that is too long', { id: 'trend:sale date:revenue', reason: 'x'.repeat(MAX_REASON_CHARS + 1) }],
    ['no reason', { id: 'trend:sale date:revenue' }],
  ])('%s → rules, with a quiet notice', async (_, pick) => {
    const h = await ask(storeOwner, { ok: true, ...pick });
    expect(h).toMatchObject({ id: 'comparison:format:count', source: 'rules', notice: HIGHLIGHT_NOTICES.rejected });
  });

  it('an unreachable AI → rules, with its notice', async () => {
    const h = await ask(storeOwner, { ok: false, reason: 'ai-error' });
    expect(h).toMatchObject({ source: 'rules', notice: HIGHLIGHT_NOTICES.unavailable });
  });

  it('sends only the eligible options, their caveats, the profile summary, and the persona: never rows', async () => {
    const { fetcher, sent } = fakeAi({ ok: false, reason: 'no-key' });
    await loadHighlight(options, profile, storeOwner, roles, { fetcher });
    const body = sent[0] as Record<string, unknown> & { options: { id: string; findings: { severity: string }[] }[] };
    expect(Object.keys(body).sort()).toEqual(['options', 'persona', 'profile']);
    expect(body.options.map((o) => o.id)).toEqual(eligibleIds);
    expect(body.options.flatMap((o) => o.findings.map((f) => f.severity))).not.toContain('misleading');
    expect(JSON.stringify(body)).not.toContain('"rows"');
  });

  it('checkAiPick trims, and rejects a blank reason', () => {
    expect(checkAiPick({ id: 'a', reason: '  Good.  ' }, ['a'])).toEqual({ id: 'a', reason: 'Good.' });
    expect(checkAiPick({ id: 'a', reason: '   ' }, ['a'])).toBeNull();
  });
});

describe('caching per dataset and persona', () => {
  it('asks once per key', async () => {
    const cache = new Map<string, Promise<Highlight | null>>();
    const { fetcher } = noKey();
    const load = (p: Persona) => loadHighlight(options, profile, p, roles, { fetcher, cache, cacheKey: highlightKey(1, p) });
    const first = await load(storeOwner);
    expect(await load(storeOwner)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await load(PRESETS[1]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

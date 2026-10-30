import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './aiRequest';
import { computeFacts } from './facts';
import { parseCsv } from './loadCsv';
import type { Path, PathDraft } from './paths';
import { PRESETS } from './personas';
import { profileDataset } from './profile';
import { STORY_NOTICES, loadStory } from './story';

// Level 3 in the browser, with the network faked: no real request is ever made.

const text = readFileSync(new URL('./data/bookshop-sales.csv', import.meta.url), 'utf8');
const loaded = parseCsv(text, 'bookshop', true);
if (!loaded.ok) throw new Error('bookshop failed to parse');
const books = loaded.dataset.rows;
const bp = profileDataset(loaded.dataset.columns, books);

const drafts: PathDraft[] = [
  { question: 'How has revenue changed?', kind: 'trend', fields: ['sale date', 'revenue'], aggregate: 'sum', filters: [] },
  { question: 'Which format earns most?', kind: 'comparison', fields: ['format', 'revenue'], aggregate: 'sum', filters: [] },
];
const paths: Path[] = drafts.map((d, i) => ({ ...d, id: `p${i + 1}`, parent: null, source: i === 0 ? 'ai' : 'rules' }));
const answer = (body: object, status = 200): Fetcher => vi.fn(async () => Response.json(body, { status }));
const opts = (fetcher: Fetcher) => ({ fetcher, retryDelayMs: 0 });

describe('loadStory', () => {
  it('fills the AI’s templates with code-computed numbers', async () => {
    const fetcher = answer({ ok: true, pick: 1, title: '{top_item} leads {measure}', takeaway: '{top_item} brings in {top_share} of {measure}.' });
    const d = (await loadStory(paths, false, bp, books, PRESETS[0], opts(fetcher)))!;
    const facts = Object.fromEntries(computeFacts(paths[1], bp, books).map((f) => [f.id, f.display]));
    expect(d.source).toBe('ai');
    expect(d.path.id).toBe('p2');
    expect(d.title).toBe('Hardcover leads revenue');
    expect(d.takeaway).toBe(`Hardcover brings in ${facts.top_share} of revenue.`);
    expect(d.slots).toEqual(['top_item', 'measure', 'top_share']);
    expect(d.notice).toBeNull();
  });

  it('sends facts, not rows, and lets the AI choose only when nothing is active', async () => {
    const fetcher = answer({ ok: true, pick: 0, title: '{measure}', takeaway: '{measure}' });
    await loadStory(paths, false, bp, books, PRESETS[0], opts(fetcher));
    const sent = JSON.parse((vi.mocked(fetcher).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.forced).toBe(false);
    expect(sent.candidates).toHaveLength(2);
    expect(sent.candidates[1].facts.map((f: { id: string }) => f.id)).toContain('check_mix');
    expect(sent).not.toHaveProperty('rows');
    expect(JSON.stringify(sent).length).toBeLessThan(20_000); // facts, not 56,350 rows
  });

  it('rejects AI text with its own digits and falls back to rules, saying why', async () => {
    const fetcher = answer({ ok: true, pick: 1, title: '{top_item} leads', takeaway: '{top_item} earns 38% of revenue.' });
    const d = (await loadStory(paths, false, bp, books, PRESETS[0], opts(fetcher)))!;
    expect(d.source).toBe('rules');
    expect(d.path.id).toBe('p2'); // the AI's pick is kept; only its words are replaced
    expect(d.pickedBy).toBe('ai');
    expect(d.notice).toBe(STORY_NOTICES.invalid('takeaway: a digit outside a slot (numbers must come from facts)'));
  });

  it('rejects an unknown slot and an out-of-range pick', async () => {
    const slot = answer({ ok: true, pick: 0, title: '{growth_rate} growth', takeaway: '{measure}' });
    expect((await loadStory(paths, false, bp, books, PRESETS[0], opts(slot)))!.notice).toMatch(/unknown slot \{growth_rate\}/);
    const pick = answer({ ok: true, pick: 7, title: '{measure}', takeaway: '{measure}' });
    expect((await loadStory(paths, false, bp, books, PRESETS[0], opts(pick)))!.notice).toMatch(/picked path 7/);
  });

  it('keeps a forced story on the active path', async () => {
    const fetcher = answer({ ok: true, pick: 1, title: '{measure}', takeaway: '{measure}' });
    const d = (await loadStory([paths[0], paths[1]], true, bp, books, PRESETS[0], opts(fetcher)))!;
    expect(d.path.id).toBe('p1');
    expect(d.source).toBe('rules');
    expect(d.pickedBy).toBe('active');
  });

  it('without a key, rules pick the path with the strongest check and write the card', async () => {
    const fetcher = answer({ ok: false, reason: 'no-key' }, 503);
    const d = (await loadStory(paths, false, bp, books, PRESETS[0], opts(fetcher)))!;
    expect(fetcher).toHaveBeenCalledTimes(1); // no retry for a missing key
    expect(d).toMatchObject({ source: 'rules', notice: STORY_NOTICES.noKey, aiFailed: false });
    expect(d.path.id).toBe('p2'); // the format ranking has a price/mix check
    expect(d.title).toBe('Hardcover leads revenue by format');
  });

  it('retries once when the AI is unreachable, then offers Try again', async () => {
    const down: Fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const d = (await loadStory(paths, false, bp, books, PRESETS[0], opts(down)))!;
    expect(down).toHaveBeenCalledTimes(2);
    expect(d.aiFailed).toBe(true);
  });

  it('has nothing to draft from without candidates', async () => {
    expect(await loadStory([], false, bp, books, PRESETS[0], opts(answer({})))).toBeNull();
  });
});

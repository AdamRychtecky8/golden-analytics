import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseCsv } from './loadCsv';
import { PRESETS } from './personas';
import { profileDataset } from './profile';
import type { Fetcher } from './aiRequest';
import { NOTICES, loadSuggestions } from './suggest';

// The browser side of Level 2, with the network faked: each test decides what "the
// server" answers, so no real request is ever made.

const text = readFileSync(new URL('./data/sample-sales-synthetic.csv', import.meta.url), 'utf8');
const loaded = parseCsv(text, 'sample', true);
if (!loaded.ok) throw new Error('sample failed to parse');
const { rows } = loaded.dataset;
const profile = profileDataset(loaded.dataset.columns, rows);

const answer = (body: object, status = 200): Fetcher => vi.fn(async () => Response.json(body, { status }));

const aiPath = (over: object = {}) => ({
  question: 'Which region sells the most units?',
  kind: 'comparison',
  fields: ['region', 'units'],
  aggregate: 'sum',
  filters: [],
  ...over,
});

describe('loadSuggestions', () => {
  it('uses three valid AI paths as they are, with no notice', async () => {
    const fetcher = answer({
      ok: true,
      paths: [
        aiPath(),
        aiPath({ question: 'How has revenue changed in West?', kind: 'trend', fields: ['date', 'revenue'], filters: [{ field: 'region', value: 'West' }] }),
        aiPath({ question: 'How spread out are order sizes?', kind: 'distribution', fields: ['units'] }),
      ],
    });
    const s = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher, retryDelayMs: 0 });
    expect(s.notice).toBeNull();
    expect(s.paths.map((p) => [p.id, p.kind, p.source])).toEqual([
      ['p1', 'comparison', 'ai'],
      ['p2', 'trend', 'ai'],
      ['p3', 'distribution', 'ai'],
    ]);
  });

  it('drops invalid AI paths and tops up with rules, saying so', async () => {
    const fetcher = answer({
      ok: true,
      paths: [
        aiPath(),
        aiPath({ kind: 'trend', fields: ['date', 'profit'] }), // no such column
        aiPath({ kind: 'outlier', filters: [{ field: 'region', value: 'Mars' }] }), // value never occurs
      ],
    });
    const s = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher, retryDelayMs: 0 });
    expect(s.notice).toBe(NOTICES.partial);
    expect(s.paths).toHaveLength(3);
    expect(s.paths[0].source).toBe('ai');
    expect(s.paths.slice(1).every((p) => p.source === 'rules')).toBe(true);
    expect(new Set(s.paths.map((p) => p.kind)).size).toBe(3);
  });

  it('falls back to rules with the no-key notice when the server has no key', async () => {
    const s = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher: answer({ ok: false, reason: 'no-key' }, 503) });
    expect(s.notice).toBe(NOTICES.noKey);
    expect(s.paths).toHaveLength(3);
    expect(s.paths.every((p) => p.source === 'rules')).toBe(true);
  });

  it('falls back to rules when the request fails or the reply is not JSON', async () => {
    const offline: Fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const html: Fetcher = vi.fn(async () => new Response('<!doctype html>', { status: 404 }));
    for (const fetcher of [offline, html, answer({ ok: false, reason: 'ai-error' }, 502)]) {
      const s = await loadSuggestions(profile, rows, PRESETS[1], null, { fetcher, retryDelayMs: 0 });
      expect(s.notice).toBe(NOTICES.unavailable);
      expect(s.paths.map((p) => p.source)).toEqual(['rules', 'rules', 'rules']);
    }
  });

  it('asks for follow-ups with the parent and numbers them under it', async () => {
    const top = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher: answer({ ok: false, reason: 'no-key' }) });
    const fetcher = answer({ ok: false, reason: 'no-key' });
    const kids = await loadSuggestions(profile, rows, PRESETS[0], top.paths[0], { fetcher, retryDelayMs: 0 });
    expect(kids.paths.map((p) => p.id)).toEqual(['p1.1', 'p1.2', 'p1.3']);
    const sent = JSON.parse((vi.mocked(fetcher).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.parent.question).toBe(top.paths[0].question);
    expect(sent).not.toHaveProperty('rows');
  });

  it('retries once by itself when the AI can’t be reached, and uses the second answer', async () => {
    let calls = 0;
    const flaky: Fetcher = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return Response.json({ ok: true, paths: [aiPath()] });
    });
    const s = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher: flaky, retryDelayMs: 0 });
    expect(calls).toBe(2);
    expect(s.paths[0].source).toBe('ai');
    expect(s.aiFailed).toBe(false);
  });

  it('gives up after the retry and offers "Try again"; never retries a missing key', async () => {
    const down: Fetcher = vi.fn(async () => Response.json({ ok: false, reason: 'ai-error' }, { status: 502 }));
    const failed = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher: down, retryDelayMs: 0 });
    expect(down).toHaveBeenCalledTimes(2);
    expect(failed.aiFailed).toBe(true);

    const noKey = answer({ ok: false, reason: 'no-key' }, 503);
    const off = await loadSuggestions(profile, rows, PRESETS[0], null, { fetcher: noKey, retryDelayMs: 0 });
    expect(noKey).toHaveBeenCalledTimes(1);
    expect(off.aiFailed).toBe(false);
  });
});

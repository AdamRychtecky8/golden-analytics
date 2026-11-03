import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeProfile } from '../src/aiProfile';
import { loadAsk } from '../src/ask';
import { ASK_TEXT } from '../src/askText';
import { PRESETS } from '../src/personas';
import { profileDataset } from '../src/profile';
import { UNKNOWN_ROLES } from '../src/roles';
import type { MessagesClient } from './_shared';
import { ask } from './ask';
import { card } from './card';
import { highlight } from './highlight';
import { POST as status } from './status';

// What a deployment does when ANTHROPIC_API_KEY is unset or wrong. The real API is never
// called: a wrong key is faked as the 401 the SDK throws.

const BAD_KEY = 'sk-ant-not-a-real-key';
const rows = [
  { format: 'Hardcover', revenue: '100' },
  { format: 'Paperback', revenue: '555' },
];
const dataProfile = profileDataset(['format', 'revenue'], rows);
const profile = summarizeProfile(dataProfile);
const persona = { domain: 'retail', role: 'owner', purpose: 'deciding where to invest' };

const rejectsKey = () => {
  const create = vi.fn(async () => {
    throw new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers());
  });
  const client: MessagesClient = { messages: { create } };
  return () => client;
};

const bodies = {
  highlight: {
    profile,
    persona,
    options: [{ id: 'comparison:format:count', question: 'Which format has the most records?', kind: 'comparison', facet: 'offering', findings: [] }],
  },
  card: {
    profile,
    persona,
    question: 'Which format brings in the most revenue?',
    blocks: [{ id: 'point.0', template: 'Next is {second_item}.' }],
    facts: [{ id: 'second_item', label: 'the group in second place', display: 'Hardcover' }],
  },
  ask: {
    profile,
    persona,
    text: 'Which format brings in the most?',
    rowNoun: { one: 'item sold', many: 'items sold' },
    columns: [
      { name: 'format', role: 'category', facet: 'offering', values: ['Hardcover', 'Paperback'] },
      { name: 'revenue', role: 'money', facet: null, values: [] },
    ],
    scope: [],
  },
};

afterEach(() => vi.unstubAllEnvs());

describe('/api/status', () => {
  it('reports no AI when ANTHROPIC_API_KEY is unset', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await (await status()).json()).toEqual({ ok: true, ai: false });
  });

  it('reports AI when a key is set, without echoing it', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', BAD_KEY);
    const text = await (await status()).text();
    expect(JSON.parse(text)).toEqual({ ok: true, ai: true });
    expect(text).not.toContain(BAD_KEY);
  });
});

describe('an invalid key', () => {
  it.each([
    ['highlight', () => highlight(bodies.highlight, { apiKey: BAD_KEY }, rejectsKey())],
    ['card', () => card(bodies.card, { apiKey: BAD_KEY }, rejectsKey())],
    ['ask', () => ask(bodies.ask, { apiKey: BAD_KEY }, rejectsKey())],
  ])('makes %s answer with an AI error, not the key', async (_, run) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await run();
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ ok: false, reason: 'ai-error' });
    expect(JSON.stringify(result.body)).not.toContain(BAD_KEY);
  });

  it('shows a typed question the "unreachable" message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = await ask(bodies.ask, { apiKey: BAD_KEY }, rejectsKey());
    const fetcher = vi.fn(async () => Response.json(server.body, { status: server.status }));
    const result = await loadAsk('Which format brings in the most?', dataProfile, rows, UNKNOWN_ROLES, PRESETS[0], [], { fetcher, retryDelayMs: 0 });
    expect(result).toMatchObject({ kind: 'refuse', category: 'unreachable', message: ASK_TEXT.unreachable });
  });
});

describe('no server behind /api', () => {
  it('shows a typed question the "unreachable" message', async () => {
    const fetcher = vi.fn(async () => new Response('Not found', { status: 404 }));
    const result = await loadAsk('Which format brings in the most?', dataProfile, rows, UNKNOWN_ROLES, PRESETS[0], [], { fetcher, retryDelayMs: 0 });
    expect(result).toMatchObject({ kind: 'refuse', category: 'unreachable', message: ASK_TEXT.unreachable });
  });
});

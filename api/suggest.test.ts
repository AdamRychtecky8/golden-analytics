import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { PATH_KINDS, buildRequest } from '../src/paths';
import { PRESETS } from '../src/personas';
import { profileDataset } from '../src/profile';
import { DEFAULT_MODEL, POST, suggest, type MessagesClient } from './suggest';

// These tests never call the real API: `suggest` takes the client as an argument, and
// each test passes a fake whose `create` returns (or throws) whatever the test needs.

const rows = [
  { date: '2025-01-10', region: 'West', units: '100' },
  { date: '2025-02-10', region: 'East', units: '555' },
  { date: '2025-03-10', region: 'East', units: '900' },
];
const body = buildRequest(profileDataset(['date', 'region', 'units'], rows), PRESETS[0], null);
const aiPaths = [{ question: 'Which region sells most?', kind: 'comparison', fields: ['region', 'units'], aggregate: 'sum', filters: [] }];

function reply(text: string, stop_reason: Anthropic.Message['stop_reason'] = 'end_turn'): Anthropic.Message {
  return { content: [{ type: 'text', text }], stop_reason } as unknown as Anthropic.Message;
}

function fakeClient(result: Anthropic.Message | Error) {
  const create = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const client: MessagesClient = { messages: { create } };
  return { create, make: vi.fn(() => client) };
}

const KEY = { apiKey: 'test-key' };

describe('suggest handler', () => {
  it('reports a missing key without creating a client', async () => {
    const fake = fakeClient(reply('{}'));
    const result = await suggest(body, {}, fake.make);
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ ok: false, reason: 'no-key' });
    expect(fake.make).not.toHaveBeenCalled();
  });

  it('rejects a body that is not a profile and persona', async () => {
    const fake = fakeClient(reply('{}'));
    for (const bad of [null, 'text', {}, { profile: { columns: 'x' }, persona: {} }]) {
      expect((await suggest(bad, KEY, fake.make)).status).toBe(400);
    }
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('returns the AI’s paths as sent, for the browser to validate', async () => {
    const fake = fakeClient(reply(JSON.stringify({ paths: aiPaths })));
    const result = await suggest(body, KEY, fake.make);
    expect(result).toEqual({ status: 200, body: { ok: true, model: DEFAULT_MODEL, paths: aiPaths } });
  });

  it('sends the profile and persona, never rows, with small limits', async () => {
    const fake = fakeClient(reply(JSON.stringify({ paths: aiPaths })));
    // A misbehaving browser sends rows anyway; the handler copies only known fields.
    await suggest({ ...body, rows }, { ...KEY, model: 'claude-test' }, fake.make);
    const params = fake.create.mock.calls[0][0 as never] as Anthropic.MessageCreateParamsNonStreaming;
    expect(params.model).toBe('claude-test');
    expect(params.max_tokens).toBeLessThanOrEqual(2000);
    expect(params.output_config?.format?.type).toBe('json_schema');
    const sent = JSON.stringify(params.messages);
    expect(sent).toContain('deciding where to invest');
    expect(sent).toContain('region');
    // 555 is neither the min nor the max of units, so it can only appear if a row leaked.
    expect(sent).not.toContain('555');
    expect(sent).not.toContain('2025-02-10');
  });

  it('turns API errors, early stops, and bad JSON into ai-error responses', async () => {
    const apiError = new Anthropic.APIError(429, undefined, 'rate limited', new Headers());
    const cases = [
      fakeClient(apiError),
      fakeClient(new Error('socket hang up')),
      fakeClient(reply('{"paths": [', 'max_tokens')),
      fakeClient(reply('not json')),
      fakeClient(reply('{"answer": 42}')),
      fakeClient(reply('', 'refusal')),
    ];
    for (const fake of cases) {
      const result = await suggest(body, KEY, fake.make);
      expect(result.status).toBe(502);
      expect(result.body).toMatchObject({ ok: false, reason: 'ai-error' });
    }
  });

  it('lists the same path kinds as the app', async () => {
    const fake = fakeClient(reply(JSON.stringify({ paths: [] })));
    await suggest(body, KEY, fake.make);
    const params = fake.create.mock.calls[0][0 as never] as Anthropic.MessageCreateParamsNonStreaming;
    const schema = params.output_config!.format!.schema as any;
    expect(schema.properties.paths.items.properties.kind.enum).toEqual([...PATH_KINDS]);
  });
});

describe('POST (the Vercel entry point)', () => {
  it('answers with JSON and a status, even for a body that is not JSON', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const response = await POST(new Request('http://x/api/suggest', { method: 'POST', body: '{oops' }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'no-key' });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

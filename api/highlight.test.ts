import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { HighlightRequest } from '../src/highlight';
import { summarizeProfile } from '../src/paths';
import { profileDataset } from '../src/profile';
import { highlight } from './highlight';
import type { MessagesClient } from './_shared';

// The real API is never called: `highlight` takes the client as an argument.

const rows = [
  { format: 'Hardcover', revenue: '100' },
  { format: 'Paperback', revenue: '555' },
  { format: 'Paperback', revenue: '900' },
];
const body: HighlightRequest = {
  profile: summarizeProfile(profileDataset(['format', 'revenue'], rows)),
  persona: { domain: 'retail', role: 'owner', purpose: 'deciding where to invest' },
  options: [
    { id: 'comparison:format:count', question: 'Which format has the most records?', kind: 'comparison', facet: 'offering', findings: [{ check: 'concentration', severity: 'caveat' }] },
  ],
};

function fake(text: string) {
  const create = vi.fn(async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) as unknown as Anthropic.Message);
  const client: MessagesClient = { messages: { create } };
  return { create, make: vi.fn(() => client) };
}

describe('highlight handler', () => {
  it('reports a missing key without creating a client', async () => {
    const f = fake('{}');
    expect((await highlight(body, {}, f.make)).body).toMatchObject({ ok: false, reason: 'no-key' });
    expect(f.make).not.toHaveBeenCalled();
  });

  it('rejects a request with no options, or an option with an unknown kind', async () => {
    const f = fake('{}');
    expect((await highlight({ ...body, options: [] }, { apiKey: 'k' }, f.make)).status).toBe(400);
    expect((await highlight({ ...body, options: [{ ...body.options[0], kind: 'driver' }] }, { apiKey: 'k' }, f.make)).status).toBe(400);
  });

  it('passes { id, reason } through for the browser to check', async () => {
    const f = fake(JSON.stringify({ id: 'comparison:format:count', reason: 'It shows what sells.' }));
    expect((await highlight(body, { apiKey: 'k' }, f.make)).body).toMatchObject({ ok: true, id: 'comparison:format:count', reason: 'It shows what sells.' });
  });

  it('reports a reply without an id and reason as an AI error', async () => {
    const f = fake(JSON.stringify({ id: 'x' }));
    expect((await highlight(body, { apiKey: 'k' }, f.make)).body).toMatchObject({ ok: false, reason: 'ai-error' });
  });

  it('sends the options and profile, never rows or extra fields, and forbids digits in the prompt', async () => {
    const f = fake(JSON.stringify({ id: 'comparison:format:count', reason: 'r' }));
    const extra = { ...body, rows, options: [{ ...body.options[0], view: { fields: ['format'] }, secret: 'x' }] };
    await highlight(extra, { apiKey: 'k' }, f.make);
    const params = f.create.mock.calls[0][0 as never] as Anthropic.MessageCreateParamsNonStreaming;
    const sent = JSON.stringify(params.messages);
    expect(sent).toContain('comparison:format:count');
    expect(sent).not.toContain('555'); // a row value that is not in the profile summary
    expect(sent).not.toContain('secret');
    expect(params.system).toMatch(/No digits/);
  });
});

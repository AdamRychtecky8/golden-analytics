import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { CardAiRequest } from '../src/cardAi';
import { summarizeProfile } from '../src/paths';
import { profileDataset } from '../src/profile';
import type { MessagesClient } from './_shared';
import { card } from './card';

// The real API is never called: `card` takes the client as an argument.

const rows = [
  { format: 'Hardcover', revenue: '100' },
  { format: 'Paperback', revenue: '555' },
  { format: 'Paperback', revenue: '900' },
];
const body: CardAiRequest = {
  profile: summarizeProfile(profileDataset(['format', 'revenue'], rows)),
  persona: { domain: 'retail', role: 'owner', purpose: 'deciding where to invest' },
  question: 'Which format brings in the most revenue?',
  blocks: [{ id: 'point.0', template: 'Next is {second_item} at {second_amount}.' }],
  facts: [
    { id: 'second_item', label: 'the group in second place', display: 'Hardcover' },
    { id: 'second_amount', label: "Hardcover's revenue", display: '100 in revenue' },
  ],
};

function fake(text: string) {
  const create = vi.fn(async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) as unknown as Anthropic.Message);
  const client: MessagesClient = { messages: { create } };
  return { create, make: vi.fn(() => client) };
}

describe('card handler', () => {
  it('reports a missing key without creating a client', async () => {
    const f = fake('{}');
    expect((await card(body, {}, f.make)).body).toMatchObject({ ok: false, reason: 'no-key' });
    expect(f.make).not.toHaveBeenCalled();
  });

  it('rejects a request without blocks', async () => {
    expect((await card({ ...body, blocks: [] }, { apiKey: 'k' }, fake('{}').make)).status).toBe(400);
  });

  it('passes the blocks through for the browser to check', async () => {
    const f = fake(JSON.stringify({ blocks: [{ id: 'point.0', template: 'Then {second_item}, at {second_amount}.' }] }));
    expect((await card(body, { apiKey: 'k' }, f.make)).body).toMatchObject({ ok: true, blocks: [{ id: 'point.0' }] });
  });

  it('sends templates and facts, never rows or extra fields, and forbids digits in the prompt', async () => {
    const f = fake(JSON.stringify({ blocks: [] }));
    await card({ ...body, rows, blocks: [{ ...body.blocks[0], secret: 'x' }] }, { apiKey: 'k' }, f.make);
    const params = f.create.mock.calls[0][0 as never] as Anthropic.MessageCreateParamsNonStreaming;
    const sent = JSON.stringify(params.messages);
    expect(sent).toContain('{second_item}');
    expect(sent).not.toContain('555');
    expect(sent).not.toContain('secret');
    expect(params.system).toMatch(/no digits/);
  });
});

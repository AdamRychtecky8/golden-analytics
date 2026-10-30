import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { summarizeProfile } from '../src/paths';
import { profileDataset } from '../src/profile';
import type { StoryRequest } from '../src/story';
import { story } from './story';
import type { MessagesClient } from './_shared';

// The real API is never called: `story` takes the client as an argument.

const rows = [
  { format: 'Hardcover', revenue: '100' },
  { format: 'Paperback', revenue: '555' },
  { format: 'Paperback', revenue: '900' },
];
const body: StoryRequest = {
  profile: summarizeProfile(profileDataset(['format', 'revenue'], rows)),
  persona: { domain: 'retail', role: 'owner', purpose: 'deciding where to invest' },
  candidates: [
    {
      question: 'Which format earns most?',
      kind: 'comparison',
      fields: ['format', 'revenue'],
      aggregate: 'sum',
      filters: [],
      facts: [{ id: 'top_item', label: 'the top group', display: 'Paperback' }],
    },
  ],
  forced: true,
};

function fake(text: string) {
  const create = vi.fn(async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) as unknown as Anthropic.Message);
  const client: MessagesClient = { messages: { create } };
  return { create, make: vi.fn(() => client) };
}

describe('story handler', () => {
  it('reports a missing key without creating a client', async () => {
    const f = fake('{}');
    expect((await story(body, {}, f.make)).body).toMatchObject({ ok: false, reason: 'no-key' });
    expect(f.make).not.toHaveBeenCalled();
  });

  it('rejects a request without candidates', async () => {
    const f = fake('{}');
    expect((await story({ ...body, candidates: [] }, { apiKey: 'k' }, f.make)).status).toBe(400);
  });

  it('passes the templates through for the browser to check', async () => {
    const f = fake(JSON.stringify({ pick: 0, title: '{top_item} leads', takeaway: '{top_item} earns the most.' }));
    const r = await story(body, { apiKey: 'k' }, f.make);
    expect(r.body).toMatchObject({ ok: true, pick: 0, title: '{top_item} leads', takeaway: '{top_item} earns the most.' });
  });

  it('sends facts and the profile, never rows, and forbids digits in the prompt', async () => {
    const f = fake(JSON.stringify({ pick: 0, title: 't', takeaway: 'k' }));
    await story({ ...body, rows }, { apiKey: 'k' }, f.make);
    const params = f.create.mock.calls[0][0 as never] as Anthropic.MessageCreateParamsNonStreaming;
    const sent = JSON.stringify(params.messages);
    expect(sent).toContain('top_item');
    expect(sent).not.toContain('555'); // a middle revenue value: only a leaked row would contain it
    expect(params.system).toMatch(/no digits/);
  });

  it('turns a reply without text into an ai-error', async () => {
    const f = fake(JSON.stringify({ pick: 0 }));
    expect((await story(body, { apiKey: 'k' }, f.make)).body).toMatchObject({ ok: false, reason: 'ai-error' });
  });
});

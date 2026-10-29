// Type-only import: erased when compiled, so this server file never pulls browser code in.
import type { StoryCandidate, StoryRequest } from '../src/story.ts';
import {
  aiError,
  callModel,
  envFromProcess,
  noKey,
  readBody,
  readDraft,
  readProfileAndPersona,
  realClient,
  str,
  type ErrorBody,
  type MessagesClient,
  type SuggestEnv,
} from './suggest.ts';

// Level 3's AI call: the same server-side pattern as api/suggest.ts. It sends the data
// profile, the persona, and for each candidate path its facts (computed in the browser
// from the rows), never the rows themselves. The AI picks a path and writes a title and
// takeaway as templates with {fact_id} slots; the browser checks and fills them (D-052).

const MAX_TOKENS = 1200;
const MAX_CANDIDATES = 5;
const MAX_FACTS = 40;

export type StoryResponse = { ok: true; model: string; pick: unknown; title: unknown; takeaway: unknown } | ErrorBody;

/** Vercel calls this for POST /api/story. The local dev server calls it too. */
export async function POST(request: Request): Promise<Response> {
  const result = await story(await readBody(request), envFromProcess());
  return Response.json(result.body, { status: result.status });
}

export async function story(
  body: unknown,
  env: SuggestEnv,
  makeClient: (apiKey: string) => MessagesClient = realClient,
): Promise<{ status: number; body: StoryResponse }> {
  if (!env.apiKey) return noKey();
  const request = readStoryRequest(body);
  if (!request) {
    return { status: 400, body: { ok: false, reason: 'bad-request', message: 'The request is not a profile, persona, and candidate paths.' } };
  }
  const reply = await callModel(env, makeClient, {
    tag: 'story',
    system: SYSTEM_PROMPT,
    user: userMessage(request),
    schema: RESPONSE_SCHEMA,
    maxTokens: MAX_TOKENS,
  });
  if (!reply.ok) return reply;
  const json = reply.json as Record<string, unknown> | null;
  if (!json || typeof json.title !== 'string' || typeof json.takeaway !== 'string') return aiError('The AI reply had no title and takeaway.');
  // Passed through as sent: the browser checks the pick, the slots, and the digits.
  return { status: 200, body: { ok: true, model: reply.model, pick: json.pick, title: json.title, takeaway: json.takeaway } };
}

// Only fields named here are copied out of the request (see readProfileAndPersona).
function readStoryRequest(body: unknown): StoryRequest | null {
  const base = readProfileAndPersona(body);
  const b = body as Record<string, unknown> | null;
  if (!base || !Array.isArray(b?.candidates) || b.candidates.length === 0 || b.candidates.length > MAX_CANDIDATES) return null;
  const candidates: StoryCandidate[] = [];
  for (const raw of b.candidates as Record<string, unknown>[]) {
    const draft = readDraft(raw);
    if (!draft || !Array.isArray(raw.facts)) return null;
    const facts = (raw.facts as Record<string, unknown>[]).slice(0, MAX_FACTS).flatMap((f) => {
      const id = str(f?.id, 40);
      const label = str(f?.label, 160);
      const display = str(f?.display, 300);
      return id && /^[a-z][a-z0-9_]*$/.test(id) && label !== null && display !== null ? [{ id, label, display }] : [];
    });
    candidates.push({ ...draft, facts });
  }
  return { ...base, candidates, forced: b.forced === true };
}

export const SYSTEM_PROMPT = `You write the title and the one-line takeaway of a data story card for non-technical readers.
The app computed every number. You may not write any number yourself: no digits at all in your text. To use a number, or any other fact, insert its slot written as {fact_id}, using only the ids listed for the path you pick. The app replaces each slot with its computed value, exactly as shown in "display".

Return:
- pick: the index (from 0) of the candidate path with the strongest, most useful story for this user. If only one candidate is given, pick 0.
- title: under 12 words. State the main finding, not the question.
- takeaway: one sentence, under 30 words: what the reader should take away, and why it matters for the user's purpose.

Facts whose id starts with check_ are cautions the app computed (a lead that comes from price rather than volume, a group too small to trust, one group dominating). If one is present, let it shape the takeaway and don't overstate the finding.
State only what the facts support: no causes, forecasts, or advice the facts don't show. Slot values are inserted as written, so write "{top_share} of {measure}", not "{top_share} percent of". The dates in the demo data are fictional; treat them as ordinary.`;

function userMessage(r: StoryRequest): string {
  const candidates = r.candidates.map((c, index) => ({
    index,
    question: c.question,
    kind: c.kind,
    fields: c.fields,
    filters: c.filters,
    facts: c.facts,
  }));
  return [
    `User: ${r.persona.role} in ${r.persona.domain}, ${r.persona.purpose}.`,
    `Data profile: ${JSON.stringify(r.profile)}`,
    r.forced ? 'Write the story for this path (pick 0):' : 'Candidate paths (pick one):',
    JSON.stringify(candidates),
  ].join('\n\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    pick: { type: 'integer' },
    title: { type: 'string' },
    takeaway: { type: 'string' },
  },
  required: ['pick', 'title', 'takeaway'],
  additionalProperties: false,
};

// Type-only import: erased when compiled, so this server file never pulls browser code in.
import type { CardAiRequest } from '../src/cardAi.ts';
import {
  aiError,
  callModel,
  envFromProcess,
  noKey,
  readBody,
  readProfileAndPersona,
  realClient,
  str,
  type AiEnv,
  type ErrorBody,
  type MessagesClient,
} from './_shared.ts';

// The card's optional AI call: rephrase the talking points and the anticipated questions
// for the persona. It receives the code's templates and the facts they use, never rows,
// and returns templates with the same {slots}. The browser checks every block (cardAi.ts).

const MAX_TOKENS = 1500;
const MAX_BLOCKS = 12;
const MAX_FACTS = 60;

export type CardResponse = { ok: true; model: string; blocks: unknown } | ErrorBody;

/** Vercel calls this for POST /api/card. The local dev server calls it too. */
export async function POST(request: Request): Promise<Response> {
  const result = await card(await readBody(request), envFromProcess());
  return Response.json(result.body, { status: result.status });
}

export async function card(
  body: unknown,
  env: AiEnv,
  makeClient: (apiKey: string) => MessagesClient = realClient,
): Promise<{ status: number; body: CardResponse }> {
  if (!env.apiKey) return noKey();
  const request = readCardRequest(body);
  if (!request) return { status: 400, body: { ok: false, reason: 'bad-request', message: 'The request is not a profile, persona, and card blocks.' } };
  const reply = await callModel(env, makeClient, {
    tag: 'card',
    system: SYSTEM_PROMPT,
    user: userMessage(request),
    schema: RESPONSE_SCHEMA,
    maxTokens: MAX_TOKENS,
  });
  if (!reply.ok) return reply;
  const json = reply.json as { blocks?: unknown } | null;
  if (!json || !Array.isArray(json.blocks)) return aiError('The AI reply had no blocks.');
  // Passed through as sent: the browser checks the ids, slots, digits, and length.
  return { status: 200, body: { ok: true, model: reply.model, blocks: json.blocks } };
}

// Only fields named here are copied out of the request, so nothing else (rows included)
// can reach the prompt.
function readCardRequest(body: unknown): CardAiRequest | null {
  const base = readProfileAndPersona(body);
  const b = body as Record<string, unknown> | null;
  const question = str(b?.question, 300);
  if (!base || !question || !Array.isArray(b?.blocks) || b.blocks.length === 0 || b.blocks.length > MAX_BLOCKS || !Array.isArray(b.facts)) return null;
  const blocks: CardAiRequest['blocks'] = [];
  for (const raw of b.blocks as Record<string, unknown>[]) {
    const id = str(raw?.id, 80);
    const template = str(raw?.template, 300);
    if (!id || !template) return null;
    blocks.push({ id, template });
  }
  const facts = (b.facts as Record<string, unknown>[]).slice(0, MAX_FACTS).flatMap((f) => {
    const id = str(f?.id, 40);
    const label = str(f?.label, 160);
    const display = str(f?.display, 200);
    return id && /^[a-z][a-z0-9_]*$/.test(id) && label !== null && display !== null ? [{ id, label, display }] : [];
  });
  return { ...base, question, blocks, facts };
}

export const SYSTEM_PROMPT = `You reword short lines on a data card so they read naturally for one specific user. The app computed every number.
Each line is a template with slots written as {fact_id}. The app replaces each slot with its computed value ("display").

Rules for every line you return:
- Keep exactly the same slots as the original line: every slot it has, and no others. Never write a number yourself: no digits at all.
- Keep the meaning. Don't add a cause, a forecast, advice, or a claim the original doesn't make.
- One or two short sentences, plain language, for this user's purpose.
- Slot values are inserted as written, so write "{top_share} of {measure}", not "{top_share} percent of".
- The dates in the demo data are fictional; treat them as ordinary.
Return every line you were given, with the same id.`;

function userMessage(r: CardAiRequest): string {
  return [
    `User: ${r.persona.role} in ${r.persona.domain}, ${r.persona.purpose}.`,
    `The card answers: ${r.question}`,
    `Facts (slot id, meaning, value): ${JSON.stringify(r.facts)}`,
    `Lines to reword: ${JSON.stringify(r.blocks)}`,
  ].join('\n\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, template: { type: 'string' } },
        required: ['id', 'template'],
        additionalProperties: false,
      },
    },
  },
  required: ['blocks'],
  additionalProperties: false,
};

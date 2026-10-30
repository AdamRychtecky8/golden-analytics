// Type-only imports: erased when compiled, so this server file never pulls browser code in.
import type { HighlightOption, HighlightRequest } from '../src/highlight.ts';
import {
  aiError,
  callModel,
  envFromProcess,
  noKey,
  readBody,
  readProfileAndPersona,
  realClient,
  str,
  type ErrorBody,
  type MessagesClient,
  type SuggestEnv,
} from './suggest.ts';

// The highlight's AI call (SPEC "The highlight"): the same server-side pattern as
// api/suggest.ts. Code has already built the options and removed every ineligible one; the
// AI only picks one of those for the persona and says why. It never writes an option, and
// it never sees rows. The browser checks the id and the reason (src/highlight.ts).

const MAX_TOKENS = 400; // one id and one sentence
const MAX_OPTIONS = 30;
const MAX_FINDINGS = 10;

// Written out again here (not imported) because this file may only import types from src/.
const KINDS = ['comparison', 'trend'] as const satisfies readonly HighlightOption['kind'][];
const FACETS = ['offering', 'source', 'place'] as const satisfies readonly NonNullable<HighlightOption['facet']>[];
const CHECKS = ['mix', 'small', 'concentration', 'entity', 'fragile', 'cycle'] as const satisfies readonly HighlightOption['findings'][number]['check'][];
const SEVERITIES = ['caveat', 'misleading'] as const satisfies readonly HighlightOption['findings'][number]['severity'][];

export type HighlightResponse = { ok: true; model: string; id: unknown; reason: unknown } | ErrorBody;

/** Vercel calls this for POST /api/highlight. The local dev server calls it too. */
export async function POST(request: Request): Promise<Response> {
  const result = await highlight(await readBody(request), envFromProcess());
  return Response.json(result.body, { status: result.status });
}

export async function highlight(
  body: unknown,
  env: SuggestEnv,
  makeClient: (apiKey: string) => MessagesClient = realClient,
): Promise<{ status: number; body: HighlightResponse }> {
  if (!env.apiKey) return noKey();
  const request = readHighlightRequest(body);
  if (!request) {
    return { status: 400, body: { ok: false, reason: 'bad-request', message: 'The request is not a profile, persona, and options.' } };
  }
  const reply = await callModel(env, makeClient, {
    tag: 'highlight',
    system: SYSTEM_PROMPT,
    user: userMessage(request),
    schema: RESPONSE_SCHEMA,
    maxTokens: MAX_TOKENS,
  });
  if (!reply.ok) return reply;
  const json = reply.json as Record<string, unknown> | null;
  if (!json || typeof json.id !== 'string' || typeof json.reason !== 'string') return aiError('The AI reply had no id and reason.');
  // Passed through as sent: the browser checks the id is eligible and the reason has no digits.
  return { status: 200, body: { ok: true, model: reply.model, id: json.id, reason: json.reason } };
}

// Only fields named here are copied out of the request (see readProfileAndPersona), so
// nothing else the browser might send (rows included) can reach the prompt.
function readHighlightRequest(body: unknown): HighlightRequest | null {
  const base = readProfileAndPersona(body);
  const b = body as Record<string, unknown> | null;
  if (!base || !Array.isArray(b?.options) || b.options.length === 0 || b.options.length > MAX_OPTIONS) return null;
  const options: HighlightOption[] = [];
  for (const raw of b.options as Record<string, unknown>[]) {
    const id = str(raw?.id, 120);
    const question = str(raw?.question, 200);
    const kind = KINDS.find((k) => k === raw?.kind);
    if (!id || !question || !kind) return null;
    const facet = FACETS.find((f) => f === raw.facet) ?? null;
    const findings = (Array.isArray(raw.findings) ? (raw.findings as Record<string, unknown>[]) : []).slice(0, MAX_FINDINGS).flatMap((f) => {
      const check = CHECKS.find((c) => c === f?.check);
      const severity = SEVERITIES.find((s) => s === f?.severity);
      return check && severity ? [{ check, severity }] : [];
    });
    options.push({ id, question, kind, facet, findings });
  }
  return { ...base, options };
}

export const SYSTEM_PROMPT = `You recommend where a non-technical user should start, from a menu of analyses the app has already built and checked.
Every option is safe: the app has removed any whose obvious reading would mislead. Some carry caveats (for example, one group dominating, a narrow lead, or a single year of dates); those are fine to pick.

Pick the one option most useful for this user's decision, given who they are and why they're here.
Return:
- id: copied exactly from the options. Never invent one.
- reason: one sentence, under 20 words, saying why it fits this user. No digits and no numbers at all: you haven't seen the results, so don't state or guess any. Don't describe what the chart will show.
Facets say what a category is: offering (what the business sells or does), source (who supplies or creates it), place (where).`;

function userMessage(r: HighlightRequest): string {
  return [
    `User: ${r.persona.role} in ${r.persona.domain}, ${r.persona.purpose}.`,
    `Data profile: ${JSON.stringify(r.profile)}`,
    'Options (pick one id):',
    JSON.stringify(r.options),
  ].join('\n\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { id: { type: 'string' }, reason: { type: 'string' } },
  required: ['id', 'reason'],
  additionalProperties: false,
};

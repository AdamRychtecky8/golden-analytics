// Type-only imports: erased when compiled, so this server file never pulls browser code in.
import type { PathKind, SuggestRequest } from '../src/paths.ts';
import {
  aiError,
  callModel,
  envFromProcess,
  noKey,
  readBody,
  readDraft,
  readProfileAndPersona,
  realClient,
  type AiEnv,
  type ErrorBody,
  type MessagesClient,
} from './_shared.ts';

// The one place the app talks to the AI. It runs on the server (a Vercel serverless
// function, or the Vite dev server locally; see vite.config.ts), so the API key never
// reaches the browser. The AI only chooses questions and fields; the browser validates
// what comes back and computes every number (D-011).

const MAX_TOKENS = 1500; // three short paths fit in a few hundred tokens; the rest is headroom

// Written out again here (not imported) because this file may only import types from
// src/. `satisfies` makes the compiler check that every entry is a real PathKind.
const KINDS = ['trend', 'comparison', 'outlier', 'distribution', 'driver'] as const satisfies readonly PathKind[];

export type SuggestResponse = { ok: true; model: string; paths: unknown[] } | ErrorBody;

/** Vercel calls this for POST /api/suggest. The local dev server calls it too. */
export async function POST(request: Request): Promise<Response> {
  const result = await suggest(await readBody(request), envFromProcess());
  return Response.json(result.body, { status: result.status });
}

/**
 * The handler itself, with no HTTP in it: a request body and settings in, a status and a
 * JSON body out. It never throws; every failure becomes a response the browser can act on
 * (it falls back to rule-based paths).
 */
export async function suggest(
  body: unknown,
  env: AiEnv,
  makeClient: (apiKey: string) => MessagesClient = realClient,
): Promise<{ status: number; body: SuggestResponse }> {
  if (!env.apiKey) return noKey();
  const request = readRequest(body);
  if (!request) {
    return { status: 400, body: { ok: false, reason: 'bad-request', message: 'The request is not a data profile and persona.' } };
  }

  const reply = await callModel(env, makeClient, {
    tag: 'suggest',
    system: SYSTEM_PROMPT,
    user: userMessage(request),
    schema: RESPONSE_SCHEMA,
    maxTokens: MAX_TOKENS,
  });
  if (!reply.ok) return reply;
  const paths = (reply.json as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths)) return aiError('The AI reply had no list of paths.');
  return { status: 200, body: { ok: true, model: reply.model, paths } };
}

// ---------------------------------------------------------------------------------------
// What goes to the AI. Only fields named here are copied out of the request, so nothing
// else the browser might send (rows included) can reach the prompt.

function readRequest(body: unknown): SuggestRequest | null {
  const base = readProfileAndPersona(body);
  return base ? { ...base, parent: readDraft((body as Record<string, unknown>).parent) } : null;
}

// How each purpose shapes the questions. The rule-based fallback follows the same idea
// as an exact kind order (KIND_ORDER in src/fallbackPaths.ts).
const PURPOSE_GUIDANCE: Record<string, string> = {
  'deciding where to invest': 'Lead with comparisons and rankings: which groups are biggest, smallest, growing.',
  'reporting results upward': 'Lead with one headline trend over time, then the comparison that explains it.',
  'testing whether a pattern is real': 'Lead with drivers and distributions: does one number move with another, how spread out is it.',
  'finding problems to fix': 'Lead with outliers and deviations: which group or period falls short or stands out.',
  'getting a feel for the data': 'Give a broad mix: one trend, one comparison, one distribution or outlier.',
};

export const SYSTEM_PROMPT = `You choose analytical questions for a data workspace used by non-technical people.
The app computes every number and draws every chart itself. You only choose what to look at.
You see a profile of the dataset (column names, types, ranges, top values, missing counts) and who the user is. You never see the rows, so never state numbers or results.

Return exactly 3 paths, each a different kind:
- question: plain language, under 12 words, phrased as a question the chart answers
- kind: trend (change over time, needs a date), comparison (ranking groups), outlier (a group that stands out), distribution (spread of one number), driver (whether one number moves with another)
- fields: 1 or 2 column names, copied exactly from the profile
- aggregate: "sum" or "mean" (how numbers are combined per group or period). Number columns marked "measure": "average" (prices, rates, discounts) must use "mean": their total means nothing. Prefer "additive" measures (revenue, units) for rankings and trends. A chart of one nominal or one date column counts records, which is always available.
- filters: a list of {"field", "value"} slices that narrow the data (empty for the whole dataset). Each field must be a nominal column that is not in fields, and each value must be copied exactly from that column's top values. A top-level path has at most one filter.

The chart comes from the field types: date + number = line over time; nominal + number = sorted bars; number + number = scatter; one number = histogram; one nominal = counts; one date = counts over time; date + nominal = count lines per group; nominal + nominal = count grid. Pick fields whose chart answers the question.
Prefer nominal columns with about 12 distinct values or fewer for bars and lines: past that the chart gets crowded and the rest are combined into "Other". Use a column with many values (like titles or names) only inside a filtered slice.
Take the dates as they are, even if they look unusual (the demo data is fictional and set in the future): never mention the year as odd.

If a parent path is given, return 3 follow-ups about that parent only: each one should help answer the parent's question, not open a new topic. Each follow-up must keep all of the parent's filters and add exactly one new filter, so it looks inside the parent's slice (usually its top group, e.g. a ranking by genre goes deeper into the top genre). Keep the parent's measure when it has one (if the parent ranks revenue, the follow-ups are about revenue). Then look at that narrower slice in a different way: over time, broken down by another field, or its spread. Never repeat the parent or one of the top-level questions, and never suggest anything outside its slice.`;

function userMessage(r: SuggestRequest): string {
  const guidance = PURPOSE_GUIDANCE[r.persona.purpose] ?? PURPOSE_GUIDANCE['getting a feel for the data'];
  return [
    `User: ${r.persona.role} in ${r.persona.domain}, ${r.persona.purpose}. ${guidance}`,
    `Data profile: ${JSON.stringify(r.profile)}`,
    r.parent ? `Parent path: ${JSON.stringify(r.parent)}` : 'Suggest 3 top-level paths.',
  ].join('\n\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    paths: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          kind: { type: 'string', enum: [...KINDS] },
          fields: { type: 'array', items: { type: 'string' } },
          aggregate: { type: 'string', enum: ['sum', 'mean'] },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, value: { type: 'string' } },
              required: ['field', 'value'],
              additionalProperties: false,
            },
          },
        },
        required: ['question', 'kind', 'fields', 'aggregate', 'filters'],
        additionalProperties: false,
      },
    },
  },
  required: ['paths'],
  additionalProperties: false,
};

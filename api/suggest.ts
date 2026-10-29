import Anthropic from '@anthropic-ai/sdk';
// Type-only imports: erased when compiled, so this server file never pulls browser code in.
import type { ColumnSummary, PathDraft, PathKind, SuggestRequest } from '../src/paths.ts';

// The one place the app talks to the AI. It runs on the server (a Vercel serverless
// function, or the Vite dev server locally; see vite.config.ts), so the API key never
// reaches the browser. The AI only chooses questions and fields; the browser validates
// what comes back and computes every number (D-011).

// Haiku: the fast, inexpensive tier. Override with ANTHROPIC_MODEL in .env.
export const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 15_000;
const MAX_TOKENS = 1500; // three short paths fit in a few hundred tokens; the rest is headroom
const MAX_BODY_CHARS = 50_000;

// Written out again here (not imported) because this file may only import types from
// src/. `satisfies` makes the compiler check that every entry is a real PathKind.
const KINDS = ['trend', 'comparison', 'outlier', 'distribution', 'driver'] as const satisfies readonly PathKind[];

export type ErrorBody = { ok: false; reason: 'no-key' | 'bad-request' | 'ai-error'; message: string };
export type SuggestResponse = { ok: true; model: string; paths: unknown[] } | ErrorBody;

export interface SuggestEnv {
  apiKey?: string;
  model?: string;
}

/** The slice of the SDK client this file uses. Tests pass a fake with the same shape. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export const realClient = (apiKey: string): MessagesClient => new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

/** Vercel calls this for POST /api/suggest. The local dev server calls it too. */
export async function POST(request: Request): Promise<Response> {
  const result = await suggest(await readBody(request), envFromProcess());
  return Response.json(result.body, { status: result.status });
}

/** The request body as JSON, or null if it's too big or not JSON. */
export async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const envFromProcess = (): SuggestEnv => ({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });

/**
 * The handler itself, with no HTTP in it: a request body and settings in, a status and a
 * JSON body out. It never throws; every failure becomes a response the browser can act on
 * (it falls back to rule-based paths).
 */
export async function suggest(
  body: unknown,
  env: SuggestEnv,
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

export const noKey = () => ({
  status: 503,
  body: { ok: false, reason: 'no-key', message: 'No ANTHROPIC_API_KEY is set on the server.' } as ErrorBody,
});

/**
 * One model call shared by both handlers: send the prompt with a JSON schema, check how
 * the model stopped, and parse the JSON. Every failure becomes an error response; this
 * never throws.
 */
export async function callModel(
  env: SuggestEnv,
  makeClient: (apiKey: string) => MessagesClient,
  req: { tag: string; system: string; user: string; schema: Record<string, unknown>; maxTokens: number },
): Promise<{ ok: true; json: unknown; model: string } | { ok: false; status: number; body: ErrorBody }> {
  const model = env.model || DEFAULT_MODEL;
  try {
    const response = await makeClient(env.apiKey!).messages.create({
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      // Low effort: these are quick choices, and speed matters here. The JSON schema
      // makes the reply parseable; the browser still checks every field.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
    });
    if (response.stop_reason !== 'end_turn') return { ok: false, ...aiError(`The AI stopped early (${response.stop_reason}).`) };
    const textBlock = response.content.find((b) => b.type === 'text');
    return { ok: true, json: textBlock ? JSON.parse(textBlock.text) : null, model };
  } catch (error) {
    // Log the status for whoever runs the server; never echo the key or the full error.
    if (error instanceof Anthropic.APIError) {
      console.error(`[${req.tag}] Anthropic API error ${error.status ?? '(no status)'}`);
      return { ok: false, ...aiError(`The AI request failed (${error.status ?? 'network'}).`) };
    }
    if (error instanceof SyntaxError) return { ok: false, ...aiError('The AI reply was not valid JSON.') };
    console.error(`[${req.tag}] unexpected error`, error instanceof Error ? error.message : error);
    return { ok: false, ...aiError('The AI request failed.') };
  }
}

export function aiError(message: string) {
  return { status: 502, body: { ok: false as const, reason: 'ai-error' as const, message } };
}

// ---------------------------------------------------------------------------------------
// What goes to the AI. Only fields named here are copied out of the request, so nothing
// else the browser might send (rows included) can reach the prompt.

export const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);
export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readRequest(body: unknown): SuggestRequest | null {
  const base = readProfileAndPersona(body);
  return base ? { ...base, parent: readDraft((body as Record<string, unknown>).parent) } : null;
}

/** The profile summary and persona, copied field by field. Both handlers start here. */
export function readProfileAndPersona(body: unknown): Omit<SuggestRequest, 'parent'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const profile = b.profile as Record<string, unknown> | undefined;
  const persona = b.persona as Record<string, unknown> | undefined;
  if (!profile || !persona || !Array.isArray(profile.columns) || profile.columns.length > 100) return null;

  const columns: ColumnSummary[] = [];
  for (const raw of profile.columns as Record<string, unknown>[]) {
    const name = str(raw?.name, 100);
    const type = raw?.type;
    if (!name || (type !== 'nominal' && type !== 'quantitative' && type !== 'temporal')) return null;
    const col: ColumnSummary = { name, type, missing: num(raw.missing) ?? 0, distinct: num(raw.distinct) ?? 0 };
    if (raw.measure === 'additive' || raw.measure === 'average') col.measure = raw.measure;
    const min = num(raw.min) ?? str(raw.min, 40);
    const max = num(raw.max) ?? str(raw.max, 40);
    if (min !== null) col.min = min;
    if (max !== null) col.max = max;
    if (Array.isArray(raw.topValues)) {
      col.topValues = (raw.topValues as Record<string, unknown>[]).slice(0, 5).flatMap((t) => {
        const value = str(t?.value, 100);
        const count = num(t?.count);
        return value !== null && count !== null ? [{ value, count }] : [];
      });
    }
    columns.push(col);
  }

  const domain = str(persona.domain, 40);
  const role = str(persona.role, 40);
  const purpose = str(persona.purpose, 60);
  if (!domain || !role || !purpose) return null;

  return {
    profile: { rowCount: num(profile.rowCount) ?? 0, columns },
    // Checked as short strings, not against the persona lists: an unknown purpose only
    // means the prompt uses the general guidance. The cast records that choice.
    persona: { domain, role, purpose } as SuggestRequest['persona'],
  };
}

/** A path's question and chart (a parent, or a story candidate), copied field by field. */
export function readDraft(raw: unknown): PathDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const question = str(p.question, 200);
  const fields = Array.isArray(p.fields) ? p.fields.filter((f): f is string => typeof f === 'string').slice(0, 2) : [];
  if (!question || fields.length === 0) return null;
  const filters = (Array.isArray(p.filters) ? (p.filters as Record<string, unknown>[]) : []).slice(0, 3).flatMap((f) => {
    const field = str(f?.field, 100);
    const value = str(f?.value, 100);
    return field && value ? [{ field, value }] : [];
  });
  return {
    question,
    kind: KINDS.find((k) => k === p.kind) ?? 'comparison',
    fields,
    aggregate: p.aggregate === 'mean' ? 'mean' : 'sum',
    filters,
  };
}

// How each purpose shapes the questions. The rule-based fallback follows the same idea
// as an exact kind order (KIND_ORDER in src/fallbackPaths.ts).
const PURPOSE_GUIDANCE: Record<string, string> = {
  'deciding where to invest': 'Lead with comparisons and rankings: which groups are biggest, smallest, growing.',
  'reporting results upward': 'Lead with one headline trend over time, then the comparison that explains it.',
  'testing whether a pattern is real': 'Lead with drivers and distributions: does one number move with another, how spread out is it.',
  'finding problems to fix': 'Lead with outliers and deviations: which group or period falls short or stands out.',
  'just exploring': 'Give a broad mix: one trend, one comparison, one distribution or outlier.',
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
  const guidance = PURPOSE_GUIDANCE[r.persona.purpose] ?? PURPOSE_GUIDANCE['just exploring'];
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

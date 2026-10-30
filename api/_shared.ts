import Anthropic from '@anthropic-ai/sdk';
// Type-only imports: erased when compiled, so this server file never pulls browser code in.
import type { ColumnSummary, PathDraft, PathKind, SuggestRequest } from '../src/paths.ts';

// What every AI handler in api/ shares: reading the request, the one model call, and the
// error shapes. The leading underscore keeps Vercel from serving this file as an endpoint.
// Each handler runs on the server, so the API key never reaches the browser, and copies
// only named fields out of the request, so nothing else (rows included) reaches a prompt.

// Haiku: the fast, inexpensive tier. Override with ANTHROPIC_MODEL in .env.
export const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 50_000;

// Written out again here (not imported) because this file may only import types from
// src/. `satisfies` makes the compiler check that every entry is a real PathKind.
const KINDS = ['trend', 'comparison', 'outlier', 'distribution', 'driver'] as const satisfies readonly PathKind[];

export type ErrorBody = { ok: false; reason: 'no-key' | 'bad-request' | 'ai-error'; message: string };

export interface AiEnv {
  apiKey?: string;
  model?: string;
}

/** The slice of the SDK client the handlers use. Tests pass a fake with the same shape. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export const realClient = (apiKey: string): MessagesClient => new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

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

export const envFromProcess = (): AiEnv => ({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });

export const noKey = () => ({
  status: 503,
  body: { ok: false, reason: 'no-key', message: 'No ANTHROPIC_API_KEY is set on the server.' } as ErrorBody,
});

/**
 * One model call shared by the handlers: send the prompt with a JSON schema, check how the
 * model stopped, and parse the JSON. Every failure becomes an error response; this never
 * throws.
 */
export async function callModel(
  env: AiEnv,
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

export const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);
export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The profile summary and persona, copied field by field. Every handler starts here. */
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

/** A path's question and chart (a story candidate), copied field by field. */
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

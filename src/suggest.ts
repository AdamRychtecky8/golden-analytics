import type { Row } from './aggregate';
import { ruleCandidates } from './fallbackPaths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { buildRequest, finishPaths, validatePaths, type Path, type PathSource } from './paths';

// Gets Level 2's paths for one spot in the tree: asks the server (which asks the AI),
// checks every answer, and tops up with rule-based paths. It never throws, so the panel
// always ends up with paths, whatever happened to the AI call.

export interface Suggestions {
  paths: Path[];
  notice: string | null; // one quiet line when the AI wasn't (fully) used
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

// A little longer than the server's own timeout, so the server gets to answer first.
const TIMEOUT_MS = 20_000;

export const NOTICES = {
  noKey: 'AI suggestions are off (no API key), so these paths are suggested by rules.',
  unavailable: 'The AI couldn’t be reached, so these paths are suggested by rules.',
  partial: 'Some AI suggestions didn’t pass the checks; rules filled the gaps.',
};

export async function loadSuggestions(
  profile: DataProfile,
  rows: Row[],
  persona: Persona,
  parent: Path | null,
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Suggestions> {
  let candidates: unknown = [];
  let notice: string | null = null;
  try {
    const response = await fetcher('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(profile, persona, parent)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // `await` pauses here until the reply arrives, without freezing the page.
    const body = (await response.json()) as { ok?: boolean; reason?: string; paths?: unknown };
    if (body.ok) candidates = body.paths;
    else notice = body.reason === 'no-key' ? NOTICES.noKey : NOTICES.unavailable;
  } catch {
    // Network error, timeout, or a reply that isn't JSON (e.g. no server behind /api).
    notice = NOTICES.unavailable;
  }

  const ctx = { profile, rows, parent };
  const ai = validatePaths(candidates, ctx);
  if (!notice && ai.rejected.length > 0) console.info('[suggest] AI paths dropped by validation:', ai.rejected);
  // Top up from the rules: same checks, and kinds or charts already shown are skipped.
  const rules = validatePaths(ruleCandidates(profile, rows, persona, parent), ctx, ai.paths);
  if (!notice && rules.paths.length > 0) notice = NOTICES.partial;

  const sources: PathSource[] = [...ai.paths.map(() => 'ai' as const), ...rules.paths.map(() => 'rules' as const)];
  return { paths: finishPaths([...ai.paths, ...rules.paths], sources, parent), notice };
}

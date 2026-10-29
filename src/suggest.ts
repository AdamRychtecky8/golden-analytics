import type { Row } from './aggregate';
import { ruleCandidates } from './fallbackPaths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { askAi, type AskOptions } from './aiRequest';
import { buildRequest, finishPaths, validatePaths, type Path, type PathSource } from './paths';

// Gets Level 2's paths for one spot in the tree: asks the server (which asks the AI),
// checks every answer, and tops up with rule-based paths. It never throws, so the panel
// always ends up with paths, whatever happened to the AI call.

export interface Suggestions {
  paths: Path[];
  notice: string | null; // one quiet line when the AI wasn't (fully) used
  aiFailed: boolean; // the AI couldn't be reached even after one retry: offer "Try again"
}

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
  options: AskOptions = {},
): Promise<Suggestions> {
  const reply = await askAi('/api/suggest', buildRequest(profile, persona, parent), options);
  const candidates = reply.ok ? reply.body.paths : [];
  let notice = reply.ok ? null : reply.reason === 'no-key' ? NOTICES.noKey : NOTICES.unavailable;

  const ctx = { profile, rows, parent };
  const ai = validatePaths(candidates, ctx);
  if (reply.ok && ai.rejected.length > 0) console.info('[suggest] AI paths dropped by validation:', ai.rejected);
  // Top up from the rules: same checks, and kinds or charts already shown are skipped.
  const rules = validatePaths(ruleCandidates(profile, rows, persona, parent), ctx, ai.paths);
  if (!notice && rules.paths.length > 0) notice = NOTICES.partial;

  const sources: PathSource[] = [...ai.paths.map(() => 'ai' as const), ...rules.paths.map(() => 'rules' as const)];
  return {
    paths: finishPaths([...ai.paths, ...rules.paths], sources, parent),
    notice,
    aiFailed: !reply.ok && reply.reason === 'unavailable',
  };
}

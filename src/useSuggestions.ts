import { useCallback, useEffect, useRef, useState } from 'react';
import type { Row } from './aggregate';
import type { Path } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { loadSuggestions, type Suggestions } from './suggest';

export type SuggestionState = ({ status: 'loading' } | ({ status: 'ready' } & Suggestions)) & {
  retry: () => void; // ask the AI again for this branch (after it couldn't be reached)
};

/**
 * Level 2's paths for the current spot in the tree, cached by dataset + persona + parent
 * path. Back/forward, breadcrumb jumps, and moving the slider away and back all land on a
 * key that is already cached, so the AI is asked once per branch, never twice.
 *
 * `datasetId` changes whenever a new dataset is loaded, so old answers (which name the
 * old file's columns) are never reused. The persona's name isn't in the key: only domain,
 * role, and purpose reach the AI, so two personas that share them share suggestions.
 */
export function useSuggestions(
  datasetId: number,
  profile: DataProfile,
  rows: Row[],
  persona: Persona,
  parent: Path | null,
): SuggestionState {
  const [cache, setCache] = useState<Record<string, Suggestions>>({});
  // Keys already asked for. A ref, not state: remembering a request shouldn't re-render,
  // and it stops a second request for the same key while the first is still on its way.
  const requested = useRef(new Set<string>());
  // Bumped by retry(), so the effect below runs again for the same key.
  const [attempt, setAttempt] = useState(0);
  const key = [datasetId, persona.domain, persona.role, persona.purpose, parent?.id ?? 'top'].join('|');

  useEffect(() => {
    if (requested.current.has(key)) return;
    requested.current.add(key);
    loadSuggestions(profile, rows, persona, parent)
      .catch((): Suggestions => ({ paths: [], notice: 'Something went wrong while building suggestions.', aiFailed: true }))
      // The functional update `(c) => …` adds to the newest cache, even if other answers
      // arrived while this one was loading.
      .then((result) => setCache((c) => ({ ...c, [key]: result })));
  }, [key, profile, rows, persona, parent, attempt]);

  // useCallback keeps the same function between renders unless the key changes.
  const retry = useCallback(() => {
    requested.current.delete(key);
    setCache((c) => {
      const next = { ...c };
      delete next[key];
      return next;
    });
    setAttempt((a) => a + 1);
  }, [key]);

  const hit = cache[key];
  return hit ? { status: 'ready', ...hit, retry } : { status: 'loading', retry };
}

import type { Row } from './aggregate';
import type { Path } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { loadSuggestions, type Suggestions } from './suggest';
import { useAsyncCache } from './useAsyncCache';

export type SuggestionState = ({ status: 'loading' } | ({ status: 'ready' } & Suggestions)) & {
  retry: () => void; // ask the AI again for this branch (after it couldn't be reached)
};

/**
 * Level 2's paths for the current spot in the tree, cached by dataset + persona + parent
 * path (see useAsyncCache).
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
  const key = [datasetId, persona.domain, persona.role, persona.purpose, parent?.id ?? 'top'].join('|');
  const { value, retry } = useAsyncCache(key, () =>
    loadSuggestions(profile, rows, persona, parent).catch(
      (): Suggestions => ({ paths: [], notice: 'Something went wrong while building suggestions.', aiFailed: true }),
    ),
  );
  return value ? { status: 'ready', ...value, retry } : { status: 'loading', retry };
}

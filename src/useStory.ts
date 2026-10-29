import type { Row } from './aggregate';
import type { DraftState } from './components/StoryLevel';
import type { Path } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { loadStory } from './story';
import { useAsyncCache } from './useAsyncCache';

/**
 * Which paths Level 3 drafts from, in order (D-053):
 * - a path the user chose in Level 2 comes first, and the first draft is always about it;
 * - otherwise the paths Level 2 is showing, and the AI (or the rules) picks the strongest;
 * - "Try another angle" skips paths already drafted, and starts over once all were used.
 */
export function storyCandidates(active: Path | null, shown: Path[], used: string[]): { candidates: Path[]; forced: boolean } {
  const all = active ? [active, ...shown.filter((p) => p.id !== active.id)] : shown;
  const fresh = all.filter((p) => !used.includes(p.id));
  const pool = fresh.length > 0 ? fresh : all;
  const forced = active !== null && pool[0]?.id === active.id;
  return { candidates: forced ? [active] : pool, forced };
}

/** Level 3's draft, cached like Level 2's suggestions. Only asked for while Level 3 is on screen. */
export function useStory(
  enabled: boolean,
  datasetId: number,
  profile: DataProfile,
  rows: Row[],
  persona: Persona,
  active: Path | null,
  shown: Path[] | null, // null while Level 2 is still loading
  used: string[],
): { state: DraftState; canTryAnother: boolean } {
  const { candidates, forced } = storyCandidates(active, shown ?? [], used);
  // Ids are positions in the tree, so the questions go in the key too: after "Try again"
  // in Level 2, the same id can hold a different path.
  const key =
    enabled && shown !== null && candidates.length > 0
      ? [datasetId, persona.domain, persona.role, persona.purpose, forced ? 'forced' : 'pick', ...candidates.map((c) => `${c.id}:${c.question}`)].join('|')
      : null;
  const { value, retry } = useAsyncCache(key, () => loadStory(candidates, forced, profile, rows, persona).catch(() => null));

  const total = new Set([...(active ? [active.id] : []), ...(shown ?? []).map((p) => p.id)]).size;
  const state: DraftState =
    shown === null ? { status: 'waiting' } : value === undefined && key !== null ? { status: 'loading' } : { status: 'ready', draft: value ?? null, retry };
  return { state, canTryAnother: total > 1 };
}

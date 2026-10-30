import { highlightKey, loadHighlight, type Highlight } from './highlight';
import type { Option } from './options';
import type { PathFilter } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import type { Roles } from './roles';
import { useAsyncCache } from './useAsyncCache';

/**
 * The highlight for one menu: asks the AI once per dataset, persona, and slice, and
 * remembers the answer, so going back to a node never asks again. Undefined while the
 * answer is on its way; null when the menu is empty.
 */
export function useHighlight(
  dataset: number,
  profile: DataProfile,
  roles: Roles,
  persona: Persona,
  filters: PathFilter[],
  options: Option[],
): Highlight | null | undefined {
  const { value } = useAsyncCache(highlightKey(dataset, persona, filters), () => loadHighlight(options, profile, persona, roles));
  return value;
}

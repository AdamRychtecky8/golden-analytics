import type { Card } from './card';
import { loadCardPhrasing, type CardPhrasing } from './cardAi';
import type { ChartView } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { useAsyncCache } from './useAsyncCache';

/**
 * The AI's wording for a card: asked once per dataset, view, and persona, and remembered.
 * Undefined while on its way (the card shows the code's wording meanwhile); a null card
 * (a preview) asks nothing.
 */
export function useCardPhrasing(dataset: number, view: ChartView, persona: Persona, card: Card | null, question: string, profile: DataProfile): CardPhrasing | undefined {
  const key = card ? JSON.stringify([dataset, view, persona.domain, persona.role, persona.purpose]) : null;
  const { value } = useAsyncCache(key, () => (card ? loadCardPhrasing(card, question, profile, persona) : Promise.resolve({ texts: {}, notice: null })));
  return value;
}

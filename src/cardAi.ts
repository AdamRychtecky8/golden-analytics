import { askAi, type AskOptions } from './aiRequest';
import type { Block, Card } from './card';
import { summarizeProfile, type AiContext } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { fillTemplate } from './templates';

// The optional AI layer on the card: with a key, the AI may rephrase the Key talking points
// (not a locked headline) and If they ask, for the persona. It sees the code's templates
// and the facts, never rows. Code checks every block it returns: same slots as the code's
// version (so no number is dropped or added), no digits of its own, not too long. A block
// that fails keeps the code's wording. The cautions, the can't-tell line, and the dataset
// line are never sent: they are the safety content, and stay in code wording.

export const MAX_AI_WORDS = 60;

export interface CardAiRequest extends AiContext {
  question: string; // the card's question, for context
  blocks: { id: string; template: string }[];
  facts: { id: string; label: string; display: string }[];
}

export interface CardPhrasing {
  texts: Record<string, string>; // block id → the AI's text, for blocks that passed
  notice: string | null;
}

// Wording for Adam's approval.
export const CARD_AI_NOTICES = {
  noKey: 'AI phrasing is off (no API key), so the card uses its standard wording.',
  unavailable: 'The AI couldn’t be reached, so the card uses its standard wording.',
  partial: 'Some AI wording didn’t pass the checks; those lines keep the standard wording.',
};

/** The blocks the AI may rephrase: talking points (unless locked) and the questions and answers. */
export function rephrasableBlocks(card: Card): Block[] {
  return [card.headline, ...card.points, ...card.asks.flatMap((a) => [a.question, a.answer])].filter((b) => b.rephrasable && !b.locked);
}

export function buildCardAiRequest(card: Card, question: string, profile: DataProfile, persona: Persona): CardAiRequest {
  const blocks = rephrasableBlocks(card);
  const used = new Set(blocks.flatMap((b) => b.slots));
  return {
    profile: summarizeProfile(profile),
    persona: { domain: persona.domain, role: persona.role, purpose: persona.purpose },
    question,
    blocks: blocks.map((b) => ({ id: b.id, template: b.template })),
    // Only the facts those blocks use: the AI can't reach for any other number.
    facts: card.facts.filter((f) => used.has(f.id)).map(({ id, label, display }) => ({ id, label, display })),
  };
}

/**
 * The AI's blocks that pass every check, filled from the facts. A block passes when its id
 * is one the AI was sent, its template fills (known slots, no digits, at most MAX_AI_WORDS
 * words), and it uses exactly the same slots as the code's version.
 */
export function checkAiBlocks(reply: unknown, card: Card): { texts: Record<string, string>; rejected: string[] } {
  const allowed = new Map(rephrasableBlocks(card).map((b) => [b.id, b]));
  const texts: Record<string, string> = {};
  const rejected: string[] = [];
  const items = Array.isArray((reply as { blocks?: unknown })?.blocks) ? ((reply as { blocks: unknown[] }).blocks as Record<string, unknown>[]) : [];
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : null;
    const code = id ? allowed.get(id) : undefined;
    if (!id || !code || id in texts) {
      rejected.push(`${String(item?.id)}: not a block it was sent`);
      continue;
    }
    const filled = fillTemplate(item.template, card.facts, MAX_AI_WORDS);
    if (!filled.ok) {
      rejected.push(`${id}: ${filled.reason}`);
      continue;
    }
    const same = filled.slots.length === code.slots.length && filled.slots.every((s) => code.slots.includes(s));
    if (!same) {
      rejected.push(`${id}: uses different numbers or facts than the original`);
      continue;
    }
    texts[id] = filled.text;
  }
  return { texts, rejected };
}

/** Asks the AI to rephrase the card; never throws. No rephrasable blocks: nothing is asked. */
export async function loadCardPhrasing(card: Card, question: string, profile: DataProfile, persona: Persona, options: AskOptions = {}): Promise<CardPhrasing> {
  const request = buildCardAiRequest(card, question, profile, persona);
  if (request.blocks.length === 0) return { texts: {}, notice: null };
  const reply = await askAi('/api/card', request, options);
  if (!reply.ok) return { texts: {}, notice: reply.reason === 'no-key' ? CARD_AI_NOTICES.noKey : CARD_AI_NOTICES.unavailable };
  const { texts, rejected } = checkAiBlocks(reply.body, card);
  if (rejected.length > 0) console.info('[card] AI blocks rejected:', rejected);
  return { texts, notice: rejected.length > 0 ? CARD_AI_NOTICES.partial : null };
}

/**
 * What a block shows: the user's edit always wins (D-008), then the AI's text, then the
 * code's. So a late AI reply can never replace something the user wrote.
 */
export function shownText(block: Block, ai: Record<string, string>, edits: Record<string, string>): { text: string; from: 'user' | 'ai' | 'code' } {
  if (block.id in edits) return { text: edits[block.id], from: 'user' };
  if (block.id in ai && !block.locked) return { text: ai[block.id], from: 'ai' };
  return { text: block.text, from: 'code' };
}

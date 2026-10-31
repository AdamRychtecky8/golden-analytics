import type { Fact } from './facts';

// Card text is written as a template with slots, e.g. "{top_item}: {top_amount}". Code
// checks the template and fills every slot from the facts. The words around the slots may
// contain no digits at all: a digit the AI typed itself would be a number nobody computed,
// so a template with one is rejected, not repaired (D-052).

export type Filled = { ok: true; text: string; slots: string[] } | { ok: false; reason: string };

const SLOT = /\{([a-z][a-z0-9_]*)\}/g;
const MAX_TEMPLATE_CHARS = 300;

export function fillTemplate(template: unknown, facts: Fact[], maxWords: number): Filled {
  if (typeof template !== 'string' || template.trim() === '') return { ok: false, reason: 'empty text' };
  if (template.length > MAX_TEMPLATE_CHARS) return { ok: false, reason: 'text is too long' };

  const slots = [...template.matchAll(SLOT)].map((m) => m[1]);
  const known = new Map(facts.map((f) => [f.id, f.display]));
  const unknown = slots.find((id) => !known.has(id));
  if (unknown) return { ok: false, reason: `unknown slot {${unknown}}` };

  // What's left once the slots are taken out is the AI's own wording.
  const own = template.replace(SLOT, ' ');
  if (/[{}]/.test(own)) return { ok: false, reason: 'a brace outside a slot' };
  if (/\d/.test(own)) return { ok: false, reason: 'a digit outside a slot (numbers must come from facts)' };

  const text = capitalize(template.replace(SLOT, (_, id: string) => known.get(id)!).replace(/\s+/g, ' ').trim());
  if (text.split(' ').length > maxWords) return { ok: false, reason: `more than ${maxWords} words` };
  return { ok: true, text, slots: [...new Set(slots)] };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

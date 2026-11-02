import type { Fact } from './facts';

// Card text is written as a template with slots, e.g. "{top_item}: {top_amount}". Code
// checks the template and fills every slot from the facts. The words around the slots may
// contain no digits at all: a digit the AI typed itself would be a number nobody computed,
// so a template with one is rejected, not repaired (D-052).

export type Filled = { ok: true; text: string; slots: string[] } | { ok: false; reason: string };

const SLOT = /\{([a-z][a-z0-9_]*)\}/g;
// Verb agreement: "[is|are:top_item]" becomes "are" when the top_item fact is plural (a
// contract's plural group name, "award winners"), else "is". It picks words, never a number.
const AGREE = /\[([^\]|]*)\|([^\]:]*):([a-z][a-z0-9_]*)\]/g;
const MAX_TEMPLATE_CHARS = 300;

export function fillTemplate(template: unknown, facts: Fact[], maxWords: number): Filled {
  if (typeof template !== 'string' || template.trim() === '') return { ok: false, reason: 'empty text' };
  if (template.length > MAX_TEMPLATE_CHARS) return { ok: false, reason: 'text is too long' };

  const byId = new Map(facts.map((f) => [f.id, f]));
  const agreeUnknown = [...template.matchAll(AGREE)].map((m) => m[3]).find((id) => !byId.has(id));
  if (agreeUnknown) return { ok: false, reason: `unknown slot {${agreeUnknown}}` };
  const agreed: string = template.replace(AGREE, (_, one: string, many: string, id: string) => (byId.get(id)!.plural ? many : one));

  const slots = [...agreed.matchAll(SLOT)].map((m) => m[1]);
  const known = new Map(facts.map((f) => [f.id, f.display]));
  const unknown = slots.find((id) => !known.has(id));
  if (unknown) return { ok: false, reason: `unknown slot {${unknown}}` };

  // What's left once the slots are taken out is the AI's own wording.
  const own = agreed.replace(SLOT, ' ');
  if (/[{}[\]]/.test(own)) return { ok: false, reason: 'a brace or bracket outside a slot' };
  if (/\d/.test(own)) return { ok: false, reason: 'a digit outside a slot (numbers must come from facts)' };

  const text = capitalize(agreed.replace(SLOT, (_, id: string) => known.get(id)!).replace(/\s+/g, ' ').trim());
  if (text.split(' ').length > maxWords) return { ok: false, reason: `more than ${maxWords} words` };
  return { ok: true, text, slots: [...new Set(slots)] };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fills one of code's own message templates (menu questions, highlight reasons, typed-question
 * messages) from named slots. A slot with no value is never blanked or printed as
 * "undefined": the text is null and the slot is listed, so the caller leaves the sentence
 * out and records it, tests fail, and development builds warn in the console.
 */
export function fillSlots(template: string, slots: Record<string, string>): { text: string | null; missing: string[] } {
  const missing = [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => slots[k] === undefined))];
  if (missing.length > 0) {
    if (import.meta.env.DEV) console.warn('[template] missing slot(s):', missing, 'in', JSON.stringify(template));
    return { text: null, missing };
  }
  return { text: template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k]), missing };
}

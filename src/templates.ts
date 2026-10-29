import type { Fact } from './facts';

// Story text is written as a template with slots, e.g. "{top_item} drives {top_share} of
// {measure}". Code checks the template and fills every slot from the facts. The words
// around the slots may contain no digits at all: a digit the AI typed itself would be a
// number nobody computed, so a template with one is rejected, not repaired.

export type Filled = { ok: true; text: string; slots: string[] } | { ok: false; reason: string };

const SLOT = /\{([a-z][a-z0-9_]*)\}/g;
export const MAX_TITLE_WORDS = 14;
export const MAX_TAKEAWAY_WORDS = 40;
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

/**
 * The rule-based templates: used with no key, when the AI fails, or when its templates
 * don't pass. Each kind of chart has its own pair; the first pair whose slots all exist
 * wins. They go through fillTemplate like the AI's, so they meet the same rules.
 */
const RULE_TEMPLATES: { title: string; takeaway: string }[] = [
  // Categories ranked by a total, with a price/mix check.
  {
    title: '{top_item} leads {measure} by {group_field}',
    takeaway: '{top_item} brings in {top_share} of {measure}. {check_mix}',
  },
  // Categories ranked by a total.
  {
    title: '{top_item} leads {measure} by {group_field}',
    takeaway: '{top_item} accounts for {top_share} of {measure} ({top_value}), {gap_to_second} ahead of {second_item}.',
  },
  // Categories ranked by an average.
  {
    title: '{top_item} has the highest {measure}',
    takeaway: '{top_item} has the highest {measure} at {top_value}, ahead of {second_item} at {second_value}.',
  },
  // Change over time.
  {
    title: '{measure} {direction} from {first_period} to {last_period}',
    takeaway: '{measure} went from {first_value} in {first_period} to {last_value} in {last_period} ({change_pct}), peaking in {peak_period}.',
  },
  {
    title: '{measure} {direction} from {first_period} to {last_period}',
    takeaway: '{measure} went from {first_value} in {first_period} to {last_value} in {last_period}, peaking in {peak_period}.',
  },
  // Spread of one number.
  {
    title: 'Most {measure} values fall between {p25} and {p75}',
    takeaway: 'Across {record_count} records, {measure} ranges from {min_value} to {max_value}, with a median of {median_value}.',
  },
  // Two numbers.
  {
    title: '{y_field} and {x_field}: {strength} relationship',
    takeaway: 'Across {record_count} records, {y_field} and {x_field} have a correlation of {correlation} ({strength}).',
  },
  // Two categories.
  {
    title: '{top_cell} is the most common combination',
    takeaway: '{top_cell} accounts for {top_cell_count} of {record_count} records.',
  },
];

export interface StoryText {
  title: string;
  takeaway: string;
  slots: string[]; // the fact ids the text uses, shown as "facts used"
}

/** Fills two templates; null if either fails. A scope (the path's filters) is added to the title. */
export function fillStory(title: unknown, takeaway: unknown, facts: Fact[]): StoryText | { error: string } {
  const t = fillTemplate(title, facts, MAX_TITLE_WORDS);
  if (!t.ok) return { error: `title: ${t.reason}` };
  const k = fillTemplate(takeaway, facts, MAX_TAKEAWAY_WORDS);
  if (!k.ok) return { error: `takeaway: ${k.reason}` };
  return { title: t.text, takeaway: k.text, slots: [...new Set([...t.slots, ...k.slots])] };
}

export function ruleStory(facts: Fact[]): StoryText {
  const scope = facts.find((f) => f.id === 'scope');
  for (const pair of RULE_TEMPLATES) {
    const filled = fillStory(scope ? `${pair.title} ({scope})` : pair.title, pair.takeaway, facts);
    if (!('error' in filled)) return filled;
  }
  // A chart with no comparable facts still gets a plain, true card.
  const basic = fillStory('{record_count} records', 'This chart shows {record_count} records.', facts);
  return 'error' in basic ? { title: '', takeaway: '', slots: [] } : basic;
}

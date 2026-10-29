import type { Row } from './aggregate';
import { askAi, type AskOptions } from './aiRequest';
import { computeFacts, strength, type Fact } from './facts';
import { summarizeProfile, type Path, type PathDraft, type SuggestRequest } from './paths';
import type { Persona } from './personas';
import type { DataProfile } from './profile';
import { fillStory, ruleStory } from './templates';

// Level 3: draft a story card (title + takeaway) for a path. The AI writes templates with
// fact slots; code checks and fills them (templates.ts). Any failure falls back to rule
// templates over the same facts, so the numbers are the same either way (D-052).

/** What the AI sees of one path: its question and chart, plus the facts code computed. */
export interface StoryCandidate extends PathDraft {
  facts: Pick<Fact, 'id' | 'label' | 'display'>[];
}

export interface StoryRequest {
  profile: SuggestRequest['profile'];
  persona: SuggestRequest['persona'];
  candidates: StoryCandidate[];
  forced: boolean; // true: one candidate, the active path; the AI doesn't choose
}

export interface Draft {
  path: Path; // the path the story is about; its chart goes on the card
  title: string;
  takeaway: string;
  source: 'ai' | 'rules';
  facts: Fact[]; // that path's facts
  slots: string[]; // the fact ids the text uses ("facts used")
  notice: string | null;
  aiFailed: boolean; // the AI couldn't be reached even after one retry: offer "Try again"
}

export const STORY_NOTICES = {
  noKey: 'AI drafting is off (no API key), so rules wrote this draft from the same facts.',
  unavailable: 'The AI couldn’t be reached, so rules wrote this draft from the same facts.',
  invalid: (reason: string) => `The AI’s draft didn’t pass the checks (${reason}), so rules wrote this one.`,
};

export async function loadStory(
  candidates: Path[],
  forced: boolean,
  profile: DataProfile,
  rows: Row[],
  persona: Persona,
  options: AskOptions = {},
): Promise<Draft | null> {
  if (candidates.length === 0) return null;
  const factsFor = candidates.map((c) => computeFacts(c, profile, rows));
  const request: StoryRequest = {
    profile: summarizeProfile(profile),
    persona: { domain: persona.domain, role: persona.role, purpose: persona.purpose },
    candidates: candidates.map((c, i) => ({
      question: c.question,
      kind: c.kind,
      fields: c.fields,
      aggregate: c.aggregate,
      filters: c.filters,
      facts: factsFor[i].map(({ id, label, display }) => ({ id, label, display })),
    })),
    forced,
  };

  const reply = await askAi('/api/story', request, options);
  let notice: string | null = reply.ok ? null : reply.reason === 'no-key' ? STORY_NOTICES.noKey : STORY_NOTICES.unavailable;
  let pick: number | null = null;

  if (reply.ok) {
    const p = reply.body.pick;
    // The pick must be one of the candidates, and a forced story must be about the active path.
    const validPick = Number.isInteger(p) && (p as number) >= 0 && (p as number) < candidates.length && (!forced || p === 0);
    if (!validPick) {
      notice = STORY_NOTICES.invalid(`it picked path ${JSON.stringify(p)}`);
    } else {
      pick = p as number;
      const filled = fillStory(reply.body.title, reply.body.takeaway, factsFor[pick]);
      if (!('error' in filled)) {
        return { path: candidates[pick], ...filled, source: 'ai', facts: factsFor[pick], notice: null, aiFailed: false };
      }
      notice = STORY_NOTICES.invalid(filled.error);
      console.info('[story] AI draft rejected:', filled.error, reply.body);
    }
  }

  // Rules: the AI's (valid) pick if there was one; otherwise the active path, or the
  // candidate with the strongest check or the largest change.
  const index = pick ?? (forced ? 0 : strongest(factsFor));
  const text = ruleStory(factsFor[index]);
  return {
    path: candidates[index],
    ...text,
    source: 'rules',
    facts: factsFor[index],
    notice,
    aiFailed: !reply.ok && reply.reason === 'unavailable',
  };
}

function strongest(factsFor: Fact[][]): number {
  let best = 0;
  factsFor.forEach((facts, i) => {
    if (strength(facts) > strength(factsFor[best])) best = i;
  });
  return best;
}

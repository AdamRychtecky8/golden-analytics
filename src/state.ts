import type { Aggregate } from './aggregate';
import type { Path, PathFilter, PathSource } from './paths';
import { DEFAULT_PERSONA, type Persona } from './personas';

// The slider levels (D-005). 3 is the top of the slider, 0 the bottom.
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: { level: Level; name: string }[] = [
  { level: 3, name: 'Story' },
  { level: 2, name: 'Suggest' },
  { level: 1, name: 'Map' },
  { level: 0, name: 'Explore' },
];

export const MAX_SELECTED = 2;

export interface StoryCard {
  fields: string[]; // the chart on the card; empty until the user picks "use this"
  aggregate: Aggregate;
  filters: PathFilter[]; // set when the chart came from a Level 2 path that narrows the data
  source: PathSource | null; // 'ai' or 'rules' for a Level 2 path; null for the user's own chart
  highlight: string | null; // key of the highlighted mark (see chartRules.ts)
  // The path the chart came from, and how it got there: "Use this" in Level 2, or a
  // Level 3 draft. Level 3 drafts from a path the user chose in Level 2.
  path: Path | null;
  pathVia: 'suggest' | 'story' | null;
  title: string;
  takeaway: string;
  // Who wrote each text (D-053). 'ai'/'rules': a Level 3 draft, shown with a marker. Once
  // the user edits a text it becomes 'user', the marker goes, and nothing replaces it.
  titleFrom: TextSource;
  takeawayFrom: TextSource;
}

export type TextSource = 'user' | 'ai' | 'rules' | null;

/** A Level 3 draft as it goes onto the card. */
export interface CardDraft {
  path: Path;
  title: string;
  takeaway: string;
  source: 'ai' | 'rules';
}

/**
 * Whether a draft may fill the card by itself. Never if the user has written either text,
 * or built the card's chart themselves in Level 0/1: that's their work, so Level 3 shows
 * its draft beside the card with "Use draft" instead (D-008, D-053).
 */
export function canFill(card: StoryCard): boolean {
  const ownChart = card.fields.length > 0 && card.source === null;
  return card.titleFrom !== 'user' && card.takeawayFrom !== 'user' && !ownChart;
}

/**
 * Everything one back/forward step restores. The dataset itself is NOT in here: it's
 * large and doesn't change between steps, so each snapshot stays small.
 */
export interface Snapshot {
  level: Level;
  selected: string[]; // oldest first, at most MAX_SELECTED
  aggregate: Aggregate;
  persona: Persona;
  // Level 2: the paths from the top level down to the one the user is going deeper on.
  // Empty means the top-level paths. Whole paths (not just ids) are stored, so the
  // breadcrumb can be drawn from the snapshot alone.
  branch: Path[];
  // Level 3: paths already drafted in this run of "Try another angle", so the next angle
  // uses a different one. Cleared when the Level 2 branch, the persona, or the card's path changes.
  story: { used: string[] };
  card: StoryCard;
}

export interface History {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
}

// A discriminated union again: `type` names the action, and TypeScript knows which
// extra fields come with each one.
export type Action =
  | { type: 'setLevel'; level: Level }
  | { type: 'toggleField'; field: string }
  | { type: 'selectFields'; fields: string[] }
  | { type: 'setAggregate'; aggregate: Aggregate }
  | { type: 'setPersona'; persona: Persona }
  | { type: 'useChart' }
  | { type: 'goDeeper'; path: Path }
  | { type: 'jumpTo'; depth: number }
  | { type: 'usePath'; path: Path }
  | { type: 'useDraft'; draft: CardDraft }
  | { type: 'fillDraft'; draft: CardDraft }
  | { type: 'anotherAngle'; pathId: string }
  | { type: 'toggleHighlight'; key: string }
  | { type: 'setCardText'; title: string; takeaway: string }
  | { type: 'newDataset' }
  | { type: 'back' }
  | { type: 'forward' };

export const EMPTY_CARD: StoryCard = {
  fields: [],
  aggregate: 'sum',
  filters: [],
  source: null,
  highlight: null,
  path: null,
  pathVia: null,
  title: '',
  takeaway: '',
  titleFrom: null,
  takeawayFrom: null,
};

const NO_STORY = { used: [] as string[] };

export function initialHistory(): History {
  return {
    past: [],
    present: { level: 2, selected: [], aggregate: 'sum', persona: DEFAULT_PERSONA, branch: [], story: NO_STORY, card: EMPTY_CARD },
    future: [],
  };
}

/**
 * Applies one action to the current snapshot and returns the next one. It never changes
 * the old snapshot (it builds a new object), which is what lets history keep every step.
 */
function step(s: Snapshot, action: Action): Snapshot {
  switch (action.type) {
    case 'setLevel':
      // Moving the slider never touches selections or the card (D-008).
      return { ...s, level: action.level };
    case 'toggleField': {
      if (s.selected.includes(action.field)) {
        return { ...s, selected: s.selected.filter((f) => f !== action.field) };
      }
      // A third click drops the oldest selection.
      return { ...s, selected: [...s.selected, action.field].slice(-MAX_SELECTED) };
    }
    case 'selectFields':
      return { ...s, selected: action.fields.slice(-MAX_SELECTED) };
    case 'setAggregate':
      return { ...s, aggregate: action.aggregate };
    case 'setPersona':
      // Changing the persona keeps the selection and the card (D-014). Level 2 returns to
      // the top, because the new persona gets its own top-level paths.
      return { ...s, persona: action.persona, branch: [], story: NO_STORY };
    case 'useChart':
      // Sends the previewed chart to the card. The user's title and takeaway stay as they are.
      return {
        ...s,
        card: { ...s.card, fields: s.selected, aggregate: s.aggregate, filters: [], source: null, path: null, pathVia: null, highlight: null },
      };
    case 'goDeeper':
      // Level 2 actions never touch the Level 0/1 selection.
      return { ...s, branch: [...s.branch, action.path], story: NO_STORY };
    case 'jumpTo':
      // A breadcrumb click: keep the first `depth` steps (0 = back to the top-level paths).
      return { ...s, branch: s.branch.slice(0, action.depth), story: NO_STORY };
    case 'usePath': {
      const { fields, aggregate, filters, source } = action.path;
      const card = { ...s.card, fields, aggregate, filters, source, path: action.path, pathVia: 'suggest' as const, highlight: null };
      return { ...s, card, story: NO_STORY };
    }
    case 'useDraft':
    case 'fillDraft': {
      // The draft's chart, title, and takeaway, each marked as the draft's.
      const { path, title, takeaway, source } = action.draft;
      const { fields, aggregate, filters } = path;
      const card = { ...s.card, fields, aggregate, filters, source: path.source, path, pathVia: 'story' as const, highlight: null };
      return { ...s, card: { ...card, title, takeaway, titleFrom: source, takeawayFrom: source } };
    }
    case 'anotherAngle':
      return { ...s, story: { used: [...s.story.used, action.pathId] } };
    case 'toggleHighlight': {
      const highlight = s.card.highlight === action.key ? null : action.key;
      return { ...s, card: { ...s.card, highlight } };
    }
    case 'setCardText': {
      // A text the user changed is theirs from now on; one they left alone keeps its source.
      const { card } = s;
      const titleFrom = action.title !== card.title ? 'user' : card.titleFrom;
      const takeawayFrom = action.takeaway !== card.takeaway ? 'user' : card.takeawayFrom;
      return { ...s, card: { ...card, title: action.title, takeaway: action.takeaway, titleFrom, takeawayFrom } };
    }
    default:
      return s;
  }
}

/**
 * The reducer React calls with every dispatched action. Back/forward move snapshots
 * between the stacks. Every other action records the current snapshot in `past` and
 * clears `future`, the same way a browser forgets "forward" after you click a new link.
 */
export function historyReducer(h: History, action: Action): History {
  if (action.type === 'back') {
    if (h.past.length === 0) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
  }
  if (action.type === 'forward') {
    if (h.future.length === 0) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
  }
  if (action.type === 'newDataset') {
    // Old selections and the card name columns the new file may not have, and old
    // snapshots would point at them too, so a new dataset starts a fresh history.
    // The persona and slider level carry over: they describe the user, not the data.
    const { level, persona } = h.present;
    return { past: [], present: { ...initialHistory().present, level, persona }, future: [] };
  }

  if (action.type === 'fillDraft') {
    // Level 3 filling an untouched card is a consequence of arriving there, not a step of
    // its own: it updates the current snapshot in place and keeps forward history. "Back"
    // from Level 3 returns to before the slider moved, card unfilled; "Use draft" and
    // "Try another angle" are ordinary steps. If it were a step, going back would land on
    // an unfilled Level 3, which would fill again and wipe "forward".
    if (!canFill(h.present.card)) return h;
    const filled = step(h.present, action);
    return JSON.stringify(filled) === JSON.stringify(h.present) ? h : { ...h, present: filled };
  }

  const next = step(h.present, action);
  // Actions that change nothing (re-selecting the current level, blurring an unedited
  // field) don't create an empty history step.
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present], present: next, future: [] };
}

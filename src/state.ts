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
  title: string; // always written by the user, whatever the chart's source
  takeaway: string;
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
  title: '',
  takeaway: '',
};

export function initialHistory(): History {
  return {
    past: [],
    present: { level: 2, selected: [], aggregate: 'sum', persona: DEFAULT_PERSONA, branch: [], card: EMPTY_CARD },
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
      return { ...s, persona: action.persona, branch: [] };
    case 'useChart':
      // Sends the previewed chart to the card. The user's title and takeaway stay as they are.
      return {
        ...s,
        card: { ...s.card, fields: s.selected, aggregate: s.aggregate, filters: [], source: null, highlight: null },
      };
    case 'goDeeper':
      // Level 2 actions never touch the Level 0/1 selection.
      return { ...s, branch: [...s.branch, action.path] };
    case 'jumpTo':
      // A breadcrumb click: keep the first `depth` steps (0 = back to the top-level paths).
      return { ...s, branch: s.branch.slice(0, action.depth) };
    case 'usePath': {
      const { fields, aggregate, filters, source } = action.path;
      return { ...s, card: { ...s.card, fields, aggregate, filters, source, highlight: null } };
    }
    case 'toggleHighlight': {
      const highlight = s.card.highlight === action.key ? null : action.key;
      return { ...s, card: { ...s.card, highlight } };
    }
    case 'setCardText':
      return { ...s, card: { ...s.card, title: action.title, takeaway: action.takeaway } };
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

  const next = step(h.present, action);
  // Actions that change nothing (re-selecting the current level, blurring an unedited
  // field) don't create an empty history step.
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present], present: next, future: [] };
}

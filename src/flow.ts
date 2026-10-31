import { MAX_FILTERS, type ChartView, type PathFilter } from './paths';
import { DEFAULT_PERSONA, type Persona } from './personas';

// The flow tree (SPEC "The flow", step 5). Every question the user looks at is a node, and
// nothing is ever deleted: branching from an earlier node adds a sibling, it doesn't
// replace anything. A node stores only its spec (what to show, for whom); the chart, the
// checks, the menu, and the highlight are recomputed from it by pure functions, so the tree
// stays small and can never show a stale result.
//
// Two orders are kept apart. The tree (parentId) says where a node came from. The visit
// list says where the user has been, in order, which is what back/forward follow, like a
// browser: back goes to the previous node you looked at, not to the parent.

/** How a node was made. Root is the dataset itself. */
export type NodeHow = 'root' | 'pick' | 'deeper' | 'persona' | 'custom';

export interface FlowNode {
  id: string; // "n0" is the root; then n1, n2, … in creation order
  parentId: string | null;
  how: NodeHow;
  // The chart, with the slice's filters. No fields means no question has been picked yet
  // (the root, or a slice just made by going deeper): the card shows a preview instead.
  view: ChartView;
  persona: Persona;
  optionId: string | null; // the menu option it came from, if any
  // The user's own wording for card blocks, by block id. User input is part of the spec: it
  // is never recomputed, and never replaced by the AI or a later rebuild (D-008).
  edits: Record<string, string>;
}

export interface FlowState {
  nodes: FlowNode[]; // creation order; it only ever grows
  visits: string[]; // node ids in the order the user visited them
  cursor: number; // index in visits of the current node
}

export type FlowAction =
  | { type: 'pick'; optionId: string; view: ChartView }
  | { type: 'deeper'; filter: PathFilter }
  | { type: 'persona'; persona: Persona }
  | { type: 'custom'; fields: string[] }
  | { type: 'edit'; block: string; text: string }
  | { type: 'jump'; id: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'newDataset' };

export const MAX_CUSTOM_FIELDS = 2;

const NO_VIEW = (filters: PathFilter[] = []): ChartView => ({ fields: [], aggregate: 'sum', filters });

export function initialFlow(persona: Persona = DEFAULT_PERSONA): FlowState {
  const root: FlowNode = { id: 'n0', parentId: null, how: 'root', view: NO_VIEW(), persona, optionId: null, edits: {} };
  return { nodes: [root], visits: ['n0'], cursor: 0 };
}

// ---------------------------------------------------------------------------------------
// Reading the tree. All pure: state in, answer out.

export const nodeById = (s: FlowState, id: string) => s.nodes.find((n) => n.id === id)!;
export const currentNode = (s: FlowState) => nodeById(s, s.visits[s.cursor]);
export const childrenOf = (s: FlowState, id: string) => s.nodes.filter((n) => n.parentId === id);
export const hasChart = (n: FlowNode) => n.view.fields.length > 0;
export const canBack = (s: FlowState) => s.cursor > 0;
export const canForward = (s: FlowState) => s.cursor < s.visits.length - 1;
/** Every node but the root. */
export const questionsExplored = (s: FlowState) => s.nodes.length - 1;

/** The nodes from the root down to this one, root first. */
export function pathTo(s: FlowState, id: string): FlowNode[] {
  const path: FlowNode[] = [];
  for (let n: FlowNode | undefined = nodeById(s, id); n; n = n.parentId ? nodeById(s, n.parentId) : undefined) path.unshift(n);
  return path;
}

/**
 * The node that set this node's scope: itself or its nearest ancestor that is the root or
 * a "deeper" node. Picking a menu option makes a child of this node, so a new question is
 * a sibling of the last one, not a child of it.
 */
export function scopeAnchor(s: FlowState, id: string): FlowNode {
  let n = nodeById(s, id);
  while (n.how !== 'root' && n.how !== 'deeper') n = nodeById(s, n.parentId!);
  return n;
}

/** What the map needs to know about the data to label a node. */
export interface LabelContext {
  many: string; // what the rows are called, plural: "items sold"
  typeOf: (field: string) => 'nominal' | 'quantitative' | 'temporal' | undefined;
}

/**
 * A short label for the map, as in the wireframe: "Data", "format · items sold",
 * "revenue over time", "format is Hardcover" (a slice), "same view, as Researcher".
 */
export function nodeLabel(n: FlowNode, ctx: LabelContext): string {
  if (n.how === 'root') return 'Data';
  if (n.how === 'persona') return `same view, as ${n.persona.name}`;
  if (n.how === 'deeper') {
    const f = n.view.filters[n.view.filters.length - 1];
    return `${f.field} is ${f.value}`;
  }
  const { fields } = n.view;
  const date = fields.find((f) => ctx.typeOf(f) === 'temporal');
  if (date) return `${fields.find((f) => f !== date) ?? ctx.many} over time`;
  if (fields.length === 1) return ctx.typeOf(fields[0]) === 'nominal' ? `${fields[0]} · ${ctx.many}` : fields[0];
  return fields.join(' · ');
}

// ---------------------------------------------------------------------------------------
// Changing the tree.

const sameView = (a: ChartView, b: ChartView) => JSON.stringify(a) === JSON.stringify(b);

/** Move to a node as a new visit: anything "forward" is dropped from the visit list (never from the tree). */
function visit(s: FlowState, id: string): FlowState {
  if (s.visits[s.cursor] === id) return s;
  const visits = [...s.visits.slice(0, s.cursor + 1), id];
  return { ...s, visits, cursor: visits.length - 1 };
}

/**
 * Adds a child and visits it. If the parent already has a child made the same way, with the
 * same view and persona, that child is visited instead: doing the same thing twice from
 * the same place shouldn't fill the map with copies.
 */
function addChild(s: FlowState, parent: FlowNode, child: Omit<FlowNode, 'id' | 'parentId'>): FlowState {
  const twin = childrenOf(s, parent.id).find(
    (c) => c.how === child.how && c.persona.id === child.persona.id && c.persona.purpose === child.persona.purpose && sameView(c.view, child.view),
  );
  if (twin) return visit(s, twin.id);
  const node: FlowNode = { ...child, id: `n${s.nodes.length}`, parentId: parent.id };
  return visit({ ...s, nodes: [...s.nodes, node] }, node.id);
}

export function flowReducer(s: FlowState, action: FlowAction): FlowState {
  const current = currentNode(s);
  switch (action.type) {
    case 'pick':
      // A new question in the current scope: a child of the node that set the scope.
      return addChild(s, scopeAnchor(s, current.id), { how: 'pick', view: action.view, persona: current.persona, optionId: action.optionId, edits: {} });
    case 'deeper': {
      // One more filter, at most MAX_FILTERS, never the same column twice.
      const { filters } = current.view;
      if (filters.length >= MAX_FILTERS || filters.some((f) => f.field === action.filter.field)) return s;
      return addChild(s, current, { how: 'deeper', view: NO_VIEW([...filters, action.filter]), persona: current.persona, optionId: null, edits: {} });
    }
    case 'persona': {
      const same = action.persona.id === current.persona.id && JSON.stringify(action.persona) === JSON.stringify(current.persona);
      if (same) return s;
      // Same question, seen by someone else: the menu is highlighted for them. The card is
      // the same chart, so the user's wording for it comes along.
      return addChild(s, current, { how: 'persona', view: current.view, persona: action.persona, optionId: current.optionId, edits: current.edits });
    }
    case 'custom': {
      const fields = action.fields.slice(0, MAX_CUSTOM_FIELDS);
      if (fields.length === 0) return s;
      return addChild(s, current, { how: 'custom', view: { fields, aggregate: 'sum', filters: current.view.filters }, persona: current.persona, optionId: null, edits: {} });
    }
    case 'edit': {
      // Changes the current node in place: not a new node, not a visit.
      if (current.edits[action.block] === action.text) return s;
      const node = { ...current, edits: { ...current.edits, [action.block]: action.text } };
      return { ...s, nodes: s.nodes.map((n) => (n.id === current.id ? node : n)) };
    }
    case 'jump':
      return s.nodes.some((n) => n.id === action.id) ? visit(s, action.id) : s;
    case 'back':
      return canBack(s) ? { ...s, cursor: s.cursor - 1 } : s;
    case 'forward':
      return canForward(s) ? { ...s, cursor: s.cursor + 1 } : s;
    case 'newDataset':
      // Old nodes name columns the new file may not have: a new dataset starts a new tree.
      // The persona carries over: it describes the user, not the data.
      return initialFlow(current.persona);
    default:
      return s;
  }
}

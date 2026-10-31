import { describe, expect, it } from 'vitest';
import {
  canBack,
  canForward,
  childrenOf,
  currentNode,
  flowReducer,
  initialFlow,
  nodeLabel,
  pathTo,
  questionsExplored,
  scopeAnchor,
  type FlowAction,
  type FlowState,
} from './flow';
import { PRESETS } from './personas';

const run = (actions: FlowAction[], start: FlowState = initialFlow()) => actions.reduce(flowReducer, start);
const pick = (optionId: string, fields: string[], filters: { field: string; value: string }[] = []): FlowAction => ({
  type: 'pick',
  optionId,
  view: { fields, aggregate: 'sum', filters },
});
const deeper = (field: string, value: string): FlowAction => ({ type: 'deeper', filter: { field, value } });
const here = (s: FlowState) => currentNode(s).id;

describe('the tree', () => {
  it('starts at the root, the dataset, with no question', () => {
    const s = initialFlow();
    expect(currentNode(s)).toMatchObject({ id: 'n0', how: 'root', parentId: null, view: { fields: [] } });
    expect(questionsExplored(s)).toBe(0);
  });

  it('a pick is a new question in the current scope: a sibling of the last pick, not its child', () => {
    const s = run([pick('a', ['genre', 'revenue']), pick('b', ['format', 'revenue'])]);
    expect(childrenOf(s, 'n0').map((n) => n.optionId)).toEqual(['a', 'b']);
  });

  it('branching from an earlier node keeps every other node', () => {
    const s1 = run([pick('a', ['genre', 'revenue']), deeper('genre', 'Fiction'), pick('c', ['format', 'revenue'], [{ field: 'genre', value: 'Fiction' }])]);
    const before = s1.nodes;
    const s2 = run([{ type: 'jump', id: 'n1' }, deeper('genre', 'Mystery'), { type: 'jump', id: 'n0' }, pick('b', ['format'])], s1);
    // Every node that existed is still there, unchanged; new ones were only added.
    expect(s2.nodes.slice(0, before.length)).toEqual(before);
    expect(s2.nodes.length).toBe(before.length + 2);
    expect(childrenOf(s2, 'n1').map((n) => n.view.filters.at(-1)!.value)).toEqual(['Fiction', 'Mystery']);
  });

  it('inside a slice, a pick is a child of the node that made the slice', () => {
    const s = run([pick('a', ['genre', 'revenue']), deeper('genre', 'Fiction'), pick('c', ['format', 'revenue'], [{ field: 'genre', value: 'Fiction' }]), pick('d', ['publisher'], [{ field: 'genre', value: 'Fiction' }])]);
    const slice = s.nodes.find((n) => n.how === 'deeper')!;
    expect(scopeAnchor(s, here(s)).id).toBe(slice.id);
    expect(childrenOf(s, slice.id).map((n) => n.optionId)).toEqual(['c', 'd']);
  });

  it('doing the same thing twice from the same place revisits the node instead of copying it', () => {
    const s = run([pick('a', ['genre', 'revenue']), { type: 'jump', id: 'n0' }, pick('a', ['genre', 'revenue'])]);
    expect(s.nodes.length).toBe(2);
    expect(here(s)).toBe('n1');
  });
});

describe('go deeper', () => {
  it('adds exactly one filter, to a child of the current node, with no question picked yet', () => {
    const s = run([pick('a', ['genre', 'revenue']), deeper('genre', 'Fiction')]);
    const n = currentNode(s);
    expect(n).toMatchObject({ how: 'deeper', parentId: 'n1', view: { fields: [], filters: [{ field: 'genre', value: 'Fiction' }] } });
  });

  it('stops at 3 filters', () => {
    // Deeper three times (genre, then format, then publisher): the fourth click does nothing.
    const three = run([deeper('genre', 'Fiction'), deeper('format', 'Hardcover'), deeper('publisher', 'Etaoin Shrdlu Press')]);
    expect(currentNode(three).view.filters.map((f) => f.field)).toEqual(['genre', 'format', 'publisher']);
    expect(flowReducer(three, deeper('series', 'Banana Slug'))).toBe(three);
  });

  it('never filters the same column twice', () => {
    const s = run([deeper('genre', 'Fiction')]);
    expect(flowReducer(s, deeper('genre', 'Mystery'))).toBe(s);
  });
});

describe('persona switch', () => {
  it('creates a child of the current node with the same view and the new persona', () => {
    const s = run([pick('a', ['genre', 'revenue']), { type: 'persona', persona: PRESETS[2] }]);
    const n = currentNode(s);
    expect(n).toMatchObject({ how: 'persona', parentId: 'n1', persona: PRESETS[2], optionId: 'a' });
    expect(n.view).toEqual(s.nodes[1].view);
  });

  it('does nothing when the persona is the same', () => {
    const s = run([pick('a', ['genre', 'revenue'])]);
    expect(flowReducer(s, { type: 'persona', persona: currentNode(s).persona })).toBe(s);
  });
});

describe('build my own chart', () => {
  it('is a child of the current node, inside the current slice, with at most 2 fields', () => {
    const s = run([pick('a', ['genre', 'revenue']), deeper('genre', 'Fiction'), { type: 'custom', fields: ['format', 'price', 'title'] }]);
    expect(currentNode(s)).toMatchObject({ how: 'custom', view: { fields: ['format', 'price'], filters: [{ field: 'genre', value: 'Fiction' }] } });
  });
});

describe('back and forward follow visit order, like a browser', () => {
  it('goes back through the nodes in the order they were visited, not up the tree', () => {
    // Visit n1, then n2, then jump to n0, then n1 again: back goes n0, n2, n1, n0.
    let s = run([pick('a', ['genre', 'revenue']), { type: 'jump', id: 'n0' }, pick('b', ['format', 'revenue']), { type: 'jump', id: 'n1' }]);
    expect(s.visits).toEqual(['n0', 'n1', 'n0', 'n2', 'n1']);
    const seen: string[] = [];
    while (canBack(s)) {
      s = flowReducer(s, { type: 'back' });
      seen.push(here(s));
    }
    expect(seen).toEqual(['n2', 'n0', 'n1', 'n0']);
    expect(canForward(s)).toBe(true);
    s = flowReducer(s, { type: 'forward' });
    expect(here(s)).toBe('n1');
  });

  it('a new visit after going back drops the forward visits, never the nodes', () => {
    let s = run([pick('a', ['genre', 'revenue']), { type: 'jump', id: 'n0' }, pick('b', ['format', 'revenue'])]);
    s = run([{ type: 'back' }, { type: 'back' }], s); // at n1
    s = flowReducer(s, { type: 'jump', id: 'n2' });
    expect(s.visits).toEqual(['n0', 'n1', 'n2']);
    expect(canForward(s)).toBe(false);
    expect(s.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2']);
  });

  it('jumping to the node you are on is not a visit', () => {
    const s = run([pick('a', ['genre', 'revenue'])]);
    expect(flowReducer(s, { type: 'jump', id: 'n1' })).toBe(s);
  });
});

describe('a new dataset', () => {
  it('starts a new tree and keeps the persona', () => {
    const s = run([{ type: 'persona', persona: PRESETS[1] }, pick('a', ['genre']), { type: 'newDataset' }]);
    expect(s.nodes).toHaveLength(1);
    expect(currentNode(s).persona).toEqual(PRESETS[1]);
  });
});

describe('labels and paths', () => {
  const types: Record<string, 'nominal' | 'quantitative' | 'temporal'> = { genre: 'nominal', format: 'nominal', revenue: 'quantitative', price: 'quantitative', 'sale date': 'temporal' };
  const ctx = { many: 'items sold', typeOf: (f: string) => types[f] };

  it('labels each kind of node as the wireframe does, and lists the path from the root', () => {
    const s = run([pick('a', ['genre', 'revenue']), deeper('genre', 'Fiction'), { type: 'persona', persona: PRESETS[2] }]);
    expect(pathTo(s, here(s)).map((n) => nodeLabel(n, ctx))).toEqual(['Data', 'genre · revenue', 'genre is Fiction', 'same view, as Researcher']);
  });

  it('labels counts with the row noun, trends as "over time", and a single number by its name', () => {
    const label = (fields: string[]) => nodeLabel(currentNode(run([pick('x', fields)])), ctx);
    expect(label(['format'])).toBe('format · items sold');
    expect(label(['sale date', 'revenue'])).toBe('revenue over time');
    expect(label(['sale date'])).toBe('items sold over time');
    expect(label(['price'])).toBe('price');
  });
});

describe('editing the card', () => {
  const editHeadline = (text: string): FlowAction => ({ type: 'edit', block: 'headline', text });

  it('stores the edit on the current node, in place: no new node, no visit', () => {
    const s0 = run([pick('a', ['genre', 'revenue'])]);
    const s = flowReducer(s0, editHeadline('My headline'));
    expect(currentNode(s).edits).toEqual({ headline: 'My headline' });
    expect(s.nodes).toHaveLength(s0.nodes.length);
    expect(s.visits).toEqual(s0.visits);
  });

  it('survives a persona switch: the new node shows the same chart with the same wording', () => {
    const s = run([pick('a', ['genre', 'revenue']), editHeadline('My headline'), { type: 'persona', persona: PRESETS[2] }]);
    expect(currentNode(s).how).toBe('persona');
    expect(currentNode(s).edits).toEqual({ headline: 'My headline' });
  });

  it('survives leaving and revisiting the node', () => {
    const s = run([pick('a', ['genre', 'revenue']), editHeadline('My headline'), { type: 'jump', id: 'n0' }, pick('b', ['format']), { type: 'back' }, { type: 'back' }]);
    expect(here(s)).toBe('n1');
    expect(currentNode(s).edits).toEqual({ headline: 'My headline' });
  });
});


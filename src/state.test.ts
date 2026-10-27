import { describe, expect, it } from 'vitest';
import type { Path } from './paths';
import { PRESETS } from './personas';
import { historyReducer, initialHistory, type Action, type History } from './state';

const run = (actions: Action[], start: History = initialHistory()) => actions.reduce(historyReducer, start);

describe('historyReducer', () => {
  it('starts at Level 2 with the default persona', () => {
    const h = initialHistory();
    expect(h.present.level).toBe(2);
    expect(h.present.persona.id).toBe('store-owner');
  });

  it('drops the oldest field when a third is selected', () => {
    const h = run([
      { type: 'toggleField', field: 'a' },
      { type: 'toggleField', field: 'b' },
      { type: 'toggleField', field: 'c' },
    ]);
    expect(h.present.selected).toEqual(['b', 'c']);
  });

  it('moves back and forward through every action, including slider and persona changes', () => {
    const h = run([
      { type: 'toggleField', field: 'region' },
      { type: 'setLevel', level: 1 },
      { type: 'setPersona', persona: PRESETS[2] },
    ]);
    expect(h.past).toHaveLength(3);
    const back2 = run([{ type: 'back' }, { type: 'back' }], h);
    expect(back2.present).toMatchObject({ level: 2, selected: ['region'] });
    const forward1 = run([{ type: 'forward' }], back2);
    expect(forward1.present.level).toBe(1);
  });

  it('clears forward history after a new action', () => {
    const h = run([{ type: 'setLevel', level: 0 }, { type: 'back' }, { type: 'setLevel', level: 3 }]);
    expect(h.future).toHaveLength(0);
    expect(h.present.level).toBe(3);
  });

  it('does not record actions that change nothing', () => {
    const h = run([{ type: 'setLevel', level: 2 }, { type: 'setCardText', title: '', takeaway: '' }]);
    expect(h.past).toHaveLength(0);
  });

  it('never overwrites the user\'s card text when a chart is sent or the persona changes', () => {
    const h = run([
      { type: 'setCardText', title: 'My title', takeaway: 'My point' },
      { type: 'toggleField', field: 'region' },
      { type: 'useChart' },
      { type: 'setPersona', persona: PRESETS[1] },
      { type: 'setLevel', level: 0 },
    ]);
    expect(h.present.card).toMatchObject({ title: 'My title', takeaway: 'My point', fields: ['region'] });
  });

  it('toggles a highlight on and off', () => {
    const on = run([{ type: 'toggleHighlight', key: 'West' }]);
    expect(on.present.card.highlight).toBe('West');
    expect(run([{ type: 'toggleHighlight', key: 'West' }], on).present.card.highlight).toBeNull();
  });

  it('starts a fresh history for a new dataset but keeps persona and level', () => {
    const h = run([
      { type: 'setPersona', persona: PRESETS[3] },
      { type: 'setLevel', level: 1 },
      { type: 'toggleField', field: 'region' },
      { type: 'newDataset' },
    ]);
    expect(h.past).toHaveLength(0);
    expect(h.present).toMatchObject({ level: 1, selected: [], persona: { id: 'program-manager' } });
  });
});

describe('Level 2 history', () => {
  const path = (id: string, over: Partial<Path> = {}): Path => ({
    id,
    question: `Question ${id}?`,
    kind: 'comparison',
    fields: ['region', 'revenue'],
    aggregate: 'sum',
    filter: null,
    parent: id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : null,
    source: 'ai',
    ...over,
  });
  const p1 = path('p1');
  const p11 = path('p1.1', { kind: 'trend', fields: ['date', 'revenue'], filter: { field: 'region', value: 'West' } });

  it('goes deeper, jumps back by breadcrumb, and undoes both', () => {
    const deep = run([
      { type: 'goDeeper', path: p1 },
      { type: 'goDeeper', path: p11 },
    ]);
    expect(deep.present.branch.map((p) => p.id)).toEqual(['p1', 'p1.1']);
    const jumped = run([{ type: 'jumpTo', depth: 0 }], deep);
    expect(jumped.present.branch).toEqual([]);
    expect(run([{ type: 'back' }], jumped).present.branch.map((p) => p.id)).toEqual(['p1', 'p1.1']);
    expect(run([{ type: 'back' }, { type: 'back' }], jumped).present.branch.map((p) => p.id)).toEqual(['p1']);
  });

  it('sends a path to the card with its filter and source, keeping the user’s text', () => {
    const h = run([
      { type: 'setCardText', title: 'Mine', takeaway: 'Also mine' },
      { type: 'usePath', path: p11 },
    ]);
    expect(h.present.card).toMatchObject({
      fields: ['date', 'revenue'],
      filter: { field: 'region', value: 'West' },
      source: 'ai',
      title: 'Mine',
      takeaway: 'Also mine',
    });
    expect(run([{ type: 'back' }], h).present.card.source).toBeNull();
  });

  it('clears the source and filter when the user sends their own chart', () => {
    const h = run([{ type: 'usePath', path: p11 }, { type: 'toggleField', field: 'units' }, { type: 'useChart' }]);
    expect(h.present.card).toMatchObject({ fields: ['units'], filter: null, source: null });
  });

  it('never changes the Level 0/1 selection', () => {
    const h = run([
      { type: 'toggleField', field: 'units' },
      { type: 'goDeeper', path: p1 },
      { type: 'usePath', path: p1 },
      { type: 'jumpTo', depth: 0 },
    ]);
    expect(h.present.selected).toEqual(['units']);
  });

  it('returns Level 2 to the top on a persona change, keeping the card and selection', () => {
    const h = run([
      { type: 'toggleField', field: 'units' },
      { type: 'usePath', path: p1 },
      { type: 'goDeeper', path: p1 },
      { type: 'setPersona', persona: PRESETS[3] },
    ]);
    expect(h.present.branch).toEqual([]);
    expect(h.present.selected).toEqual(['units']);
    expect(h.present.card.fields).toEqual(['region', 'revenue']);
    // Back restores the old persona together with the branch it was on.
    expect(run([{ type: 'back' }], h).present).toMatchObject({ persona: PRESETS[0], branch: [p1] });
  });

  it('keeps the branch when the slider moves away and back', () => {
    const h = run([{ type: 'goDeeper', path: p1 }, { type: 'setLevel', level: 0 }, { type: 'setLevel', level: 2 }]);
    expect(h.present.branch).toEqual([p1]);
  });
});

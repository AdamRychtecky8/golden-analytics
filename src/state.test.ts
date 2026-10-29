import { describe, expect, it } from 'vitest';
import type { Path } from './paths';
import { PRESETS } from './personas';
import { canFill, historyReducer, initialHistory, type Action, type History } from './state';

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
    filters: [],
    parent: id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : null,
    source: 'ai',
    ...over,
  });
  const p1 = path('p1');
  const p11 = path('p1.1', { kind: 'trend', fields: ['date', 'revenue'], filters: [{ field: 'region', value: 'West' }] });

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
      filters: [{ field: 'region', value: 'West' }],
      source: 'ai',
      title: 'Mine',
      takeaway: 'Also mine',
    });
    expect(run([{ type: 'back' }], h).present.card.source).toBeNull();
  });

  it('clears the source and filter when the user sends their own chart', () => {
    const h = run([{ type: 'usePath', path: p11 }, { type: 'toggleField', field: 'units' }, { type: 'useChart' }]);
    expect(h.present.card).toMatchObject({ fields: ['units'], filters: [], source: null });
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

describe('Level 3 drafts and provenance', () => {
  const path = (id: string): Path => ({
    id,
    question: `Question ${id}?`,
    kind: 'comparison',
    fields: ['format', 'revenue'],
    aggregate: 'sum',
    filters: [],
    parent: null,
    source: 'ai',
  });
  const draft = (id = 'p1', title = 'Hardcover leads revenue', source: 'ai' | 'rules' = 'ai') => ({
    path: path(id),
    title,
    takeaway: 'Hardcover brings in 38% of revenue.',
    source,
  });

  it('fills an untouched card in place, marked as an AI draft, without a history step', () => {
    const atStory = run([{ type: 'setLevel', level: 3 }]);
    const filled = run([{ type: 'fillDraft', draft: draft() }], atStory);
    expect(filled.past).toHaveLength(atStory.past.length); // no new step
    expect(filled.present.card).toMatchObject({ title: 'Hardcover leads revenue', titleFrom: 'ai', takeawayFrom: 'ai', fields: ['format', 'revenue'], pathVia: 'story' });
    // Back goes to before Level 3, with the card empty; forward returns to the filled card.
    const back = run([{ type: 'back' }], filled);
    expect(back.present.card.title).toBe('');
    expect(run([{ type: 'forward' }], back).present.card.titleFrom).toBe('ai');
  });

  it('marks edited text as the user’s and keeps the other text’s marker', () => {
    const filled = run([{ type: 'fillDraft', draft: draft() }]);
    const edited = run([{ type: 'setCardText', title: 'My own title', takeaway: filled.present.card.takeaway }], filled);
    expect(edited.present.card).toMatchObject({ titleFrom: 'user', takeawayFrom: 'ai' });
  });

  it('never fills over text the user wrote', () => {
    const mine = run([{ type: 'setCardText', title: 'Mine', takeaway: '' }]);
    expect(run([{ type: 'fillDraft', draft: draft() }], mine)).toBe(mine);
    // Once an AI title is edited, a new draft no longer fills either.
    const edited = run([{ type: 'fillDraft', draft: draft() }, { type: 'setCardText', title: 'Edited', takeaway: 'x' }]);
    expect(run([{ type: 'fillDraft', draft: draft('p2', 'Another title') }], edited).present.card.title).toBe('Edited');
  });

  it('never fills over a chart the user built in Level 0/1', () => {
    const own = run([{ type: 'toggleField', field: 'genre' }, { type: 'useChart' }]);
    expect(canFill(own.present.card)).toBe(false);
    expect(run([{ type: 'fillDraft', draft: draft() }], own)).toBe(own);
  });

  it('"Use draft" replaces the card as one undoable step', () => {
    const mine = run([{ type: 'setCardText', title: 'Mine', takeaway: 'My point' }]);
    const used = run([{ type: 'useDraft', draft: draft('p1', 'Drafted', 'rules') }], mine);
    expect(used.present.card).toMatchObject({ title: 'Drafted', titleFrom: 'rules' });
    expect(run([{ type: 'back' }], used).present.card).toMatchObject({ title: 'Mine', titleFrom: 'user' });
  });

  it('records angles already tried, and starts over when the branch or persona changes', () => {
    const h = run([
      { type: 'anotherAngle', pathId: 'p1' },
      { type: 'anotherAngle', pathId: 'p2' },
    ]);
    expect(h.present.story.used).toEqual(['p1', 'p2']);
    expect(run([{ type: 'back' }], h).present.story.used).toEqual(['p1']);
    expect(run([{ type: 'goDeeper', path: path('p3') }], h).present.story.used).toEqual([]);
    expect(run([{ type: 'setPersona', persona: PRESETS[2] }], h).present.story.used).toEqual([]);
  });

  it('remembers which path a Level 2 "Use this" put on the card', () => {
    const h = run([{ type: 'usePath', path: path('p2') }]);
    expect(h.present.card).toMatchObject({ pathVia: 'suggest', path: { id: 'p2' } });
    expect(run([{ type: 'toggleField', field: 'genre' }, { type: 'useChart' }], h).present.card.path).toBeNull();
  });
});

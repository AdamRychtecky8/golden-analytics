import { describe, expect, it } from 'vitest';
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

import { useMemo, useReducer, useState } from 'react';
import demoText from './data/bookshop-sales.csv?raw';
import { AssistLayer } from './components/AssistLayer';
import { ExploreLevel, MapLevel } from './components/Levels';
import { Slider } from './components/Slider';
import { SuggestLevel } from './components/SuggestLevel';
import { StoryCard } from './components/StoryCard';
import { TopBar } from './components/TopBar';
import type { Aggregate } from './aggregate';
import { parseCsv, type Dataset } from './loadCsv';
import { profileDataset } from './profile';
import { historyReducer, initialHistory } from './state';
import { useSuggestions } from './useSuggestions';

// The bundled demo data (fictional Bookshop sales, made by scripts/prepare-bookshop.py)
// is parsed once when the app loads. If it ever failed to parse, that's a bug in the
// repo, not a user error, so it throws loudly. The synthetic sample is kept for tests.
const DEMO: Dataset = (() => {
  const result = parseCsv(demoText, 'bookshop-sales.csv', true);
  if (!result.ok) throw new Error(`Bundled demo data failed to parse: ${result.errors.join('; ')}`);
  return result.dataset;
})();

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, initialHistory);
  const [dataset, setDataset] = useState<Dataset>(DEMO);
  // Counts dataset loads. The suggestion cache is keyed on it, so a new file never shows
  // paths that were picked for the old one.
  const [datasetId, setDatasetId] = useState(0);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  // Recompute the profile only when the dataset changes, not on every click.
  const profile = useMemo(() => profileDataset(dataset.columns, dataset.rows), [dataset]);

  const state = history.present;
  // Level 2 shows the follow-ups of the last path in the branch (or the top-level paths).
  // The request starts as soon as the app opens, whatever the slider level.
  const parent = state.branch.at(-1) ?? null;
  const suggestions = useSuggestions(datasetId, profile, dataset.rows, state.persona, parent);

  // Both non-AI levels get the same props, so they share one selection (D-008).
  const levelProps = {
    profile,
    rows: dataset.rows,
    selected: state.selected,
    aggregate: state.aggregate,
    // A card chart from a Level 2 path (with its source label or filter) isn't the same as
    // the user's own selection, so Levels 0/1 offer "Use this" rather than "Update card".
    cardFields: state.card.source || state.card.filters.length > 0 ? [] : state.card.fields,
    onToggleField: (field: string) => dispatch({ type: 'toggleField', field }),
    onSelectFields: (fields: string[]) => dispatch({ type: 'selectFields', fields }),
    onAggregate: (aggregate: Aggregate) => dispatch({ type: 'setAggregate', aggregate }),
    onUseChart: () => dispatch({ type: 'useChart' }),
  };

  function switchDataset(next: Dataset) {
    setDataset(next);
    setDatasetId((id) => id + 1);
    setLoadErrors([]);
    dispatch({ type: 'newDataset' });
  }

  async function handleFile(file: File) {
    const result = parseCsv(await file.text(), file.name);
    if (result.ok) switchDataset(result.dataset);
    else setLoadErrors([`Couldn't load ${file.name}:`, ...result.errors]);
  }

  return (
    <div className="app">
      <div>
        <TopBar
          dataset={dataset}
          persona={state.persona}
          canBack={history.past.length > 0}
          canForward={history.future.length > 0}
          onFile={handleFile}
          onSample={() => switchDataset(DEMO)}
          onPersona={(persona) => dispatch({ type: 'setPersona', persona })}
          onBack={() => dispatch({ type: 'back' })}
          onForward={() => dispatch({ type: 'forward' })}
        />
        {loadErrors.length > 0 && (
          <div className="load-errors" role="alert">
            {loadErrors[0]}
            <ul>
              {loadErrors.slice(1).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="workspace">
        <Slider level={state.level} onChange={(level) => dispatch({ type: 'setLevel', level })} />
        <AssistLayer
          level={state.level}
          persona={state.persona}
          explore={<ExploreLevel {...levelProps} visible={state.level === 0} />}
          map={<MapLevel {...levelProps} visible={state.level === 1} />}
          suggest={
            <SuggestLevel
              visible={state.level === 2}
              persona={state.persona}
              branch={state.branch}
              suggestions={suggestions}
              profile={profile}
              rows={dataset.rows}
              card={state.card}
              onGoDeeper={(path) => dispatch({ type: 'goDeeper', path })}
              onJump={(depth) => dispatch({ type: 'jumpTo', depth })}
              onUsePath={(path) => dispatch({ type: 'usePath', path })}
            />
          }
        />
        <StoryCard
          card={state.card}
          profile={profile}
          rows={dataset.rows}
          onHighlight={(key) => dispatch({ type: 'toggleHighlight', key })}
          onText={(title, takeaway) => dispatch({ type: 'setCardText', title, takeaway })}
        />
      </div>
    </div>
  );
}

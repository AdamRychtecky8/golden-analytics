import { useMemo, useReducer, useState } from 'react';
import sampleText from './data/sample-sales-synthetic.csv?raw';
import { AssistLayer } from './components/AssistLayer';
import { Slider } from './components/Slider';
import { TopBar } from './components/TopBar';
import { parseCsv, type Dataset } from './loadCsv';
import { profileDataset } from './profile';
import { historyReducer, initialHistory } from './state';

// The bundled sample is parsed once when the app loads. If it ever failed to parse,
// that's a bug in the repo, not a user error, so it throws loudly.
const SAMPLE: Dataset = (() => {
  const result = parseCsv(sampleText, 'sample-sales-synthetic.csv', true);
  if (!result.ok) throw new Error(`Bundled sample failed to parse: ${result.errors.join('; ')}`);
  return result.dataset;
})();

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, initialHistory);
  const [dataset, setDataset] = useState<Dataset>(SAMPLE);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  // Recompute the profile only when the dataset changes, not on every click.
  const profile = useMemo(() => profileDataset(dataset.columns, dataset.rows), [dataset]);

  const state = history.present;

  function switchDataset(next: Dataset) {
    setDataset(next);
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
          onSample={() => switchDataset(SAMPLE)}
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
          explore={<p className="empty-note">{profile.columns.length} fields (Level 0 arrives in the next step).</p>}
          map={<p className="empty-note">Field cards arrive in the next step.</p>}
        />
        <aside className="story" aria-label="Story card">
          <span className="label">Story card</span>
        </aside>
      </div>
    </div>
  );
}

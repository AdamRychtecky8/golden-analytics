import { useMemo, useReducer, useState } from 'react';
import demoText from './data/bookshop-sales.csv?raw';
import { loadAsk } from './ask';
import { AskBox } from './components/AskBox';
import { FlowCard } from './components/FlowCard';
import { FlowMap } from './components/FlowMap';
import { MenuRail } from './components/MenuRail';
import { TopBar } from './components/TopBar';
import { datasetFindings } from './datasetFindings';
import { canBack, canForward, currentNode, flowReducer, initialFlow, type LabelContext } from './flow';
import { parseCsv, type Dataset } from './loadCsv';
import { buildOptions } from './options';
import { profileDataset } from './profile';
import { UNKNOWN_ROLES, bookshopRoles, rowNounOf } from './roles';
import { useAiStatus } from './useAiStatus';
import { useHighlight } from './useHighlight';

// The bundled demo data (fictional Bookshop sales, made by scripts/prepare-bookshop.py)
// is parsed once when the app loads. If it ever failed to parse, that's a bug in the
// repo, not a user error, so it throws loudly.
const DEMO: Dataset = (() => {
  const result = parseCsv(demoText, 'bookshop-sales.csv', true);
  if (!result.ok) throw new Error(`Bundled demo data failed to parse: ${result.errors.join('; ')}`);
  return result.dataset;
})();

/**
 * The whole app: the map on top, the menu on the left, the card on the right. App state is
 * the flow tree; everything on screen is computed from the current node's spec (its view
 * and persona), so the tree never holds a stale chart or menu.
 */
export default function App() {
  const [flow, dispatch] = useReducer(flowReducer, undefined, () => initialFlow());
  const [dataset, setDataset] = useState<Dataset>(DEMO);
  // Counts dataset loads. The highlight cache is keyed on it, so a new file never shows a
  // highlight picked for the old one.
  const [datasetId, setDatasetId] = useState(0);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const ai = useAiStatus();

  const profile = useMemo(() => profileDataset(dataset.columns, dataset.rows), [dataset]);
  // The demo data comes with its contract; an uploaded CSV has none, so checks that need a
  // role skip and the menu has no facets (SPEC "Generality").
  const roles = useMemo(() => (dataset.demo ? bookshopRoles(dataset.columns) : UNKNOWN_ROLES), [dataset]);
  const labels = useMemo<LabelContext>(
    () => ({ many: rowNounOf(roles).many, typeOf: (f) => profile.columns.find((c) => c.name === f)?.type }),
    [roles, profile],
  );

  const node = currentNode(flow);
  const filters = node.view.filters;
  // The menu for the current node's scope, rebuilt from the spec. Sibling nodes in the same
  // slice hold equal but separate filter lists, so the memo is keyed on their content (as
  // text) and reads the filters back from it: moving between them doesn't rebuild the menu.
  const filterKey = JSON.stringify(filters);
  const options = useMemo(() => buildOptions(profile, dataset.rows, roles, JSON.parse(filterKey)), [profile, dataset.rows, roles, filterKey]);
  const highlight = useHighlight(datasetId, profile, roles, node.persona, filters, options);
  // Entities that shape several charts, found once over the top-level menu (the whole data).
  const shared = useMemo(() => datasetFindings(buildOptions(profile, dataset.rows, roles).map((o) => o.view), profile, dataset.rows, roles), [profile, dataset.rows, roles]);

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
      <TopBar
        dataset={dataset}
        persona={node.persona}
        canBack={canBack(flow)}
        canForward={canForward(flow)}
        onFile={handleFile}
        onSample={() => switchDataset(DEMO)}
        onPersona={(persona) => dispatch({ type: 'persona', persona })}
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

      <FlowMap state={flow} labels={labels} onJump={(id) => dispatch({ type: 'jump', id })} />

      <div className="workspace">
        <MenuRail
          options={options}
          highlight={highlight}
          filters={filters}
          currentOptionId={node.optionId}
          profile={profile}
          onPick={(o) => dispatch({ type: 'pick', optionId: o.id, view: o.view })}
          onCustom={(fields) => dispatch({ type: 'custom', fields })}
          ask={
            <AskBox
              ai={ai}
              profile={profile}
              roles={roles}
              ask={(text) => loadAsk(text, profile, dataset.rows, roles, node.persona, filters)}
              onUse={(view, asked) => dispatch({ type: 'ask', view, asked })}
            />
          }
        />
        <FlowCard
          node={node}
          dataset={datasetId}
          options={options}
          highlight={highlight}
          datasetFindings={shared}
          profile={profile}
          rows={dataset.rows}
          roles={roles}
          onDeeper={(filter) => dispatch({ type: 'deeper', filter })}
          onPick={(o) => dispatch({ type: 'pick', optionId: o.id, view: o.view })}
          onEdit={(block, text) => dispatch({ type: 'edit', block, text })}
        />
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Row } from '../aggregate';
import { MAX_FILTERS, chartForView, sameView, type Path } from '../paths';
import { describePersona, type Persona } from '../personas';
import type { DataProfile } from '../profile';
import type { StoryCard } from '../state';
import type { SuggestionState } from '../useSuggestions';
import { runChecks } from '../checks';
import { Chart } from './Chart';

interface SuggestLevelProps {
  visible: boolean; // only the level the slider is on builds and draws its charts
  persona: Persona;
  branch: Path[]; // from the top level down to the path being explored; empty = top level
  suggestions: SuggestionState;
  profile: DataProfile;
  rows: Row[];
  card: StoryCard;
  onGoDeeper: (path: Path) => void;
  onJump: (depth: number) => void;
  onUsePath: (path: Path) => void;
}

const PREVIEW_HEIGHT = 150;

/**
 * Level 2 — Suggest: analytical paths, each a question plus the chart that answers it.
 * The AI (or the rules) picked the question and fields; the chart is computed in code
 * like every other chart. Every path says where it came from.
 */
export function SuggestLevel(props: SuggestLevelProps) {
  const { suggestions, branch } = props;
  return (
    <>
      <p className="suggest-persona">
        <span className="label">Tailored to</span> {describePersona(props.persona)}{' '}
        <button type="button" className="link-btn" onClick={openPersonaPicker}>
          Change
        </button>
      </p>

      <Breadcrumb branch={branch} onJump={props.onJump} />

      {suggestions.status === 'loading' ? (
        <Skeleton />
      ) : (
        <>
          {suggestions.notice && (
            <p className="notice" role="status">
              {suggestions.notice}{' '}
              {suggestions.aiFailed && (
                <button type="button" className="link-btn" onClick={suggestions.retry}>
                  Try again
                </button>
              )}
            </p>
          )}
          {suggestions.paths.length === 0 ? (
            <p className="empty-note">No paths fit this data.</p>
          ) : (
            <ul className="paths">
              {suggestions.paths.map((path) => (
                <PathCard
                  key={path.id}
                  path={path}
                  profile={props.profile}
                  rows={props.rows}
                  card={props.card}
                  visible={props.visible}
                  onGoDeeper={() => props.onGoDeeper(path)}
                  onUse={(shown) => props.onUsePath(shown)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// The persona picker lives in the top bar. "Change" moves focus there and, where the
// browser supports it, opens the list, instead of keeping a second picker in sync.
function openPersonaPicker() {
  const select = document.getElementById('persona-select') as HTMLSelectElement | null;
  if (!select) return;
  select.focus();
  try {
    select.showPicker();
  } catch {
    // Older browsers, or no user gesture: focusing the picker is enough.
  }
}

/** Where you are in the tree. Each earlier step is a button that jumps back to it. */
function Breadcrumb({ branch, onJump }: { branch: Path[]; onJump: (depth: number) => void }) {
  const steps = [{ id: 'top', label: 'Top paths' }, ...branch.map((p) => ({ id: p.id, label: p.question }))];
  return (
    <nav className="crumbs" aria-label="Where you are in the paths">
      <ol>
        {steps.map((step, depth) => (
          <li key={step.id}>
            {depth === steps.length - 1 ? (
              <span aria-current="location">{step.label}</span>
            ) : (
              <button type="button" className="link-btn" onClick={() => onJump(depth)}>
                {step.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface PathCardProps {
  path: Path;
  profile: DataProfile;
  rows: Row[];
  card: StoryCard;
  visible: boolean;
  onGoDeeper: () => void;
  onUse: (shown: Path) => void; // the path as shown: itself, or its by-count version
}

function PathCard({ path, profile, rows, card, visible, onGoDeeper, onUse }: PathCardProps) {
  // "View by count" is a look at this card only, so it's local state, not history.
  const [byCount, setByCount] = useState(false);
  const checks = useMemo(() => (visible ? runChecks(path, profile, rows).findings : []), [visible, path, profile, rows]);
  const countView = checks.find((c) => c.countView)?.countView;
  // The path as shown: the same question and source, charted by count instead of money.
  const shown = useMemo<Path>(
    () => (byCount && countView ? { ...path, ...countView, id: `${path.id}-count`, question: `${path.question} (by count)` } : path),
    [byCount, countView, path],
  );
  // Cached paths are the same objects every render, so the chart is built once per path.
  const chart = useMemo(
    () => (visible ? chartForView(shown, profile, rows, { highlight: null, height: PREVIEW_HEIGHT }) : null),
    [visible, shown, profile, rows],
  );
  const onCard = card.source === shown.source && sameView(card, shown, profile);
  const from = path.source === 'ai' ? 'AI' : 'Rules';
  return (
    <li className={onCard ? 'path-card is-selected' : 'path-card'}>
      <div className="path-tags">
        <span className="chip">{path.kind}</span>
        <span className={`source source-${path.source}`} title={`Suggested by ${path.source === 'ai' ? 'AI' : 'rules'}`}>
          {from}
        </span>
      </div>
      <h3 className="path-question">{path.question}</h3>
      {chart ? (
        <>
          <span className="label">{chart.title}</span>
          <Chart spec={chart.spec} label={`${path.question} ${chart.title}`} />
          {chart.notes.length > 0 && (
            <ul className="chart-notes">
              {chart.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      ) : visible ? (
        <p className="empty-note">This path’s chart couldn’t be drawn.</p>
      ) : (
        <div className="chart-placeholder" aria-hidden="true" />
      )}
      {checks.length > 0 && (
        // Computed in code (checks.ts) and labeled as a check, never as AI.
        <ul className="checks" aria-label="Checks on this chart">
          {checks.map((c) => (
            <li key={c.id}>
              <span className="label">Check</span> {c.text}{' '}
              {c.countView && (
                <button type="button" className="link-btn" onClick={() => setByCount((b) => !b)}>
                  {byCount ? 'Back to the original' : 'View by count'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="path-actions">
        <button
          type="button"
          className="btn"
          onClick={onGoDeeper}
          // Each level down adds a filter; a path holds at most MAX_FILTERS (D-051).
          disabled={path.filters.length >= MAX_FILTERS}
          title={path.filters.length >= MAX_FILTERS ? `This path already narrows the data ${MAX_FILTERS} ways` : undefined}
        >
          Go deeper
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onUse(shown)} disabled={onCard || !chart}>
          {onCard ? 'On the card' : 'Use this →'}
        </button>
      </div>
    </li>
  );
}

/** Three quiet placeholder cards while the paths load. Nothing else on the page waits. */
function Skeleton() {
  return (
    <>
      <p className="notice" role="status">
        Finding paths…
      </p>
      <ul className="paths" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <li key={i} className="path-card skeleton">
            <span className="skeleton-line short" />
            <span className="skeleton-line" />
            <span className="skeleton-block" />
          </li>
        ))}
      </ul>
    </>
  );
}

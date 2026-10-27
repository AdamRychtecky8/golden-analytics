import { useMemo } from 'react';
import type { Row } from '../aggregate';
import { chartForView, sameView, type Path } from '../paths';
import { describePersona, type Persona } from '../personas';
import type { DataProfile } from '../profile';
import type { StoryCard } from '../state';
import type { SuggestionState } from '../useSuggestions';
import { Chart } from './Chart';

interface SuggestLevelProps {
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
              {suggestions.notice}
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
                  onCard={props.card.source === path.source && sameView(props.card, path, props.profile)}
                  onGoDeeper={() => props.onGoDeeper(path)}
                  onUse={() => props.onUsePath(path)}
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
  onCard: boolean;
  onGoDeeper: () => void;
  onUse: () => void;
}

function PathCard({ path, profile, rows, onCard, onGoDeeper, onUse }: PathCardProps) {
  // Cached paths are the same objects every render, so the chart is built once per path.
  const chart = useMemo(
    () => chartForView(path, profile, rows, { highlight: null, height: PREVIEW_HEIGHT }),
    [path, profile, rows],
  );
  const from = path.source === 'ai' ? 'AI' : 'Rules';
  return (
    <li className="path-card">
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
      ) : (
        <p className="empty-note">This path’s chart couldn’t be drawn.</p>
      )}
      <div className="path-actions">
        <button type="button" className="btn" onClick={onGoDeeper}>
          Go deeper
        </button>
        <button type="button" className="btn btn-primary" onClick={onUse} disabled={onCard || !chart}>
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

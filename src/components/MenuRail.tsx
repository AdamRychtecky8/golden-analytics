import type { Highlight } from '../highlight';
import type { Option } from '../options';
import type { PathFilter } from '../paths';
import type { DataProfile } from '../profile';
import { BuildChart } from './BuildChart';

interface MenuRailProps {
  options: Option[];
  highlight: Highlight | null | undefined; // undefined while the AI is being asked
  filters: PathFilter[];
  currentOptionId: string | null;
  profile: DataProfile;
  onPick: (option: Option) => void;
  onCustom: (fields: string[]) => void;
}

/**
 * The menu for the current scope, as in the wireframe: the highlighted question first, with
 * its label and reason, then every other option in menu order (a trap stays an ordinary
 * item, and a repair sits right after the option it repairs), any notice, and "Build my own
 * chart" at the bottom.
 */
export function MenuRail({ options, highlight, filters, currentOptionId, profile, onPick, onCustom }: MenuRailProps) {
  const top = highlight ? options.find((o) => o.id === highlight.id) : undefined;
  const rest = options.filter((o) => o !== top);

  return (
    <aside className="rail" aria-label="Questions">
      <span className="label">Questions</span>
      {filters.length > 0 && <p className="rail-scope">where {filters.map((f) => `${f.field} is ${f.value}`).join(' and ')}</p>}
      {options.length === 0 && (
        <p className="empty-note">No ready-made questions fit here: no column has between 2 and 12 groups in this slice. Build your own chart below.</p>
      )}
      {highlight === undefined && options.length > 0 && <p className="notice">Choosing where to start…</p>}

      <ul className="options">
        {top && highlight && (
          <li>
            <button type="button" className="option option-highlight" aria-pressed={top.id === currentOptionId} onClick={() => onPick(top)}>
              <span className="label option-label">{highlight.label === 'highlight' ? 'Highlighted' : 'Best place to start'}</span>
              <span className="option-question">{top.question}</span>
              <span className="option-reason">
                {highlight.source === 'ai' && <span className="source source-ai">AI</span>} {highlight.reason}
              </span>
            </button>
          </li>
        )}
        {rest.map((o) => (
          <li key={o.id}>
            <button type="button" className="option" aria-pressed={o.id === currentOptionId} onClick={() => onPick(o)}>
              <span className="option-question">{o.question}</span>
            </button>
          </li>
        ))}
      </ul>

      {highlight?.notice && <p className="notice">{highlight.notice}</p>}
      <div className="rail-build">
        <BuildChart profile={profile} onShow={onCustom} />
      </div>
    </aside>
  );
}

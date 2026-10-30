import { useState } from 'react';
import { MAX_CUSTOM_FIELDS } from '../flow';
import type { ColumnProfile, DataProfile } from '../profile';

const TYPE_LABEL: Record<ColumnProfile['type'], string> = {
  nominal: 'category',
  quantitative: 'number',
  temporal: 'date',
};

/**
 * "Build my own chart": the old field picker, cut down to choosing up to two fields. The
 * choice stays local until "Show chart", which adds one node to the map; the checks run
 * on it like on any menu question.
 */
export function BuildChart({ profile, onShow }: { profile: DataProfile; onShow: (fields: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const toggle = (name: string) =>
    // A third click drops the oldest choice.
    setChosen((c) => (c.includes(name) ? c.filter((f) => f !== name) : [...c, name].slice(-MAX_CUSTOM_FIELDS)));

  if (!open) {
    return (
      <button type="button" className="link-btn build-open" onClick={() => setOpen(true)}>
        + Build my own chart
      </button>
    );
  }
  return (
    <div className="build">
      <span className="label">Build my own chart · pick up to {MAX_CUSTOM_FIELDS}</span>
      <ul className="field-list">
        {profile.columns.map((c) => {
          const order = chosen.indexOf(c.name);
          return (
            <li key={c.name}>
              <button type="button" className="field-chip" aria-pressed={order >= 0} onClick={() => toggle(c.name)}>
                {c.name}
                <span className="field-type">{TYPE_LABEL[c.type]}</span>
                {order >= 0 && <span className="field-type">#{order + 1}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="build-actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={chosen.length === 0}
          onClick={() => {
            onShow(chosen);
            setChosen([]);
            setOpen(false);
          }}
        >
          Show chart
        </button>
      </div>
    </div>
  );
}

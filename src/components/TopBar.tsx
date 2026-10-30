import { useState, type ChangeEvent } from 'react';
import type { Dataset } from '../loadCsv';
import {
  DOMAINS,
  PRESETS,
  PURPOSES,
  ROLES,
  customPersona,
  personaColor,
  personaInitial,
  type Domain,
  type Persona,
  type Purpose,
  type Role,
} from '../personas';

interface TopBarProps {
  dataset: Dataset;
  persona: Persona;
  canBack: boolean;
  canForward: boolean;
  onFile: (file: File) => void;
  onSample: () => void;
  onPersona: (persona: Persona) => void;
  onBack: () => void;
  onForward: () => void;
}

export function TopBar(props: TopBarProps) {
  const { dataset } = props;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) props.onFile(file);
    e.target.value = ''; // so picking the same file again still triggers a change
  }

  return (
    <header className="topbar">
      <span className="topbar-name">Before you present it</span>
      <span className="dataset-name">
        {dataset.name} · {dataset.rows.length.toLocaleString('en-US')} rows
        {dataset.demo && ' · Fictional demo data'}
      </span>

      <PersonaPicker persona={props.persona} onChange={props.onPersona} />

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <label className="btn">
          Load CSV
          <input className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleFile} />
        </label>
        {!dataset.demo && (
          <button type="button" className="btn" onClick={props.onSample}>
            Use demo data
          </button>
        )}
      </div>

      {/* Back and forward follow the order you visited questions in, like a browser. */}
      <div className="topbar-group" aria-label="History">
        <button type="button" className="btn" onClick={props.onBack} disabled={!props.canBack} aria-label="Back" title="Back to the last question you looked at">
          ←
        </button>
        <button type="button" className="btn" onClick={props.onForward} disabled={!props.canForward} aria-label="Forward" title="Forward">
          →
        </button>
      </div>
    </header>
  );
}

const BUILD = '__build__';

/**
 * The persona chip: the persona's color and initial, and a picker of presets plus "build
 * your own". The build form keeps its own local state while the user is choosing, and only
 * sends a persona on Apply, so half-finished choices don't create nodes in the map.
 */
function PersonaPicker({ persona, onChange }: { persona: Persona; onChange: (p: Persona) => void }) {
  const [building, setBuilding] = useState(false);
  const [domain, setDomain] = useState<Domain>(persona.domain);
  const [role, setRole] = useState<Role>(persona.role);
  const [purpose, setPurpose] = useState<Purpose>(persona.purpose);
  const [name, setName] = useState('');
  const { color, tint } = personaColor(persona);

  function handleSelect(e: ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === BUILD) {
      // Start the form from the current persona, so small tweaks are quick.
      setDomain(persona.domain);
      setRole(persona.role);
      setPurpose(persona.purpose);
      setName(persona.custom ? persona.name : '');
      setBuilding(true);
      return;
    }
    const preset = PRESETS.find((p) => p.id === e.target.value);
    if (preset) onChange(preset);
    setBuilding(false);
  }

  function apply() {
    onChange(customPersona(domain, role, purpose, name));
    setBuilding(false);
  }

  return (
    <div className="persona">
      <span className="persona-chip" style={{ background: tint, borderColor: color }} title={`${persona.domain} · ${persona.purpose}`}>
        <span className="persona-dot" style={{ background: color }} aria-hidden="true">
          {personaInitial(persona)}
        </span>
        <label className="visually-hidden" htmlFor="persona-select">
          Persona
        </label>
        <select id="persona-select" value={building ? BUILD : persona.id} onChange={handleSelect}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {persona.custom && <option value="custom">{persona.name} (custom)</option>}
          <option value={BUILD}>Build your own…</option>
        </select>
      </span>

      {building && (
        <div className="persona-form" role="dialog" aria-label="Build your own persona">
          <span className="label">Build your own</span>
          <label>
            <span className="label">Domain</span>
            <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
              {DOMAINS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Purpose</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
              {PURPOSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Name (optional)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Café owner" />
          </label>
          <div className="persona-form-actions">
            <button type="button" className="btn" onClick={() => setBuilding(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

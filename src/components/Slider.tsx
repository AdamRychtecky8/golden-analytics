import type { CSSProperties } from 'react';
import { LEVELS, type Level } from '../state';

interface SliderProps {
  level: Level;
  onChange: (level: Level) => void;
}

/**
 * The autonomy slider: Level 3 (most AI) at the top, Level 0 (no AI) at the bottom.
 * The labels are buttons too, so a level can be picked by clicking its name.
 */
export function Slider({ level, onChange }: SliderProps) {
  const current = LEVELS.find((l) => l.level === level)!;
  return (
    <nav className="slider" aria-label="AI assistance level">
      <span className="label">AI help</span>
      <div className="slider-track">
        <input
          className="slider-input"
          type="range"
          min={0}
          max={3}
          step={1}
          value={level}
          onChange={(e) => onChange(Number(e.target.value) as Level)}
          aria-label="AI assistance level"
          aria-valuetext={`Level ${level}, ${current.name}`}
        />
        <div className="slider-labels">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              className={`slider-label${l.level === level ? ' is-current' : ''}`}
              // A CSS custom property set from code: how far down the track this label sits.
              style={{ '--pos': (3 - l.level) / 3 } as CSSProperties}
              onClick={() => onChange(l.level)}
              aria-pressed={l.level === level}
            >
              <span className="slider-label-num">{l.level}</span>
              <span className="label">{l.name}</span>
              {/* Levels 2 and 3 are where the AI works, so they say so (AI work stays visible). */}
              <span className="slider-ai">{l.level >= 2 ? 'AI' : 'NO AI'}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

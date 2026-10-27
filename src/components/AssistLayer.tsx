import { useEffect, useRef, type ReactNode } from 'react';
import { describePersona, type Persona } from '../personas';
import { LEVELS, type Level } from '../state';

interface AssistLayerProps {
  level: Level;
  persona: Persona;
  explore: ReactNode; // Level 0 content
  map: ReactNode; // Level 1 content
}

/**
 * The middle column: four stacked panels, Level 3 at the top. Only the slider moves it
 * (D-007): the column itself has overflow hidden, and an effect scrolls it to the
 * current level's panel whenever the level changes.
 */
export function AssistLayer({ level, persona, explore, map }: AssistLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<Level, HTMLElement | null>>({ 0: null, 1: null, 2: null, 3: null });
  // The level we last scrolled to. null until the first render.
  const shownLevel = useRef<Level | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const panel = panelRefs.current[level];
    if (!container || !panel) return;
    // Jump instantly when the page opens (and when React re-runs this effect for the same
    // level in development), animate only when the level actually changes.
    // 'auto' means "use the CSS scroll-behavior": smooth normally, instant when the user
    // prefers reduced motion (see .assist in styles.css).
    const changed = shownLevel.current !== null && shownLevel.current !== level;
    container.scrollTo({ top: panel.offsetTop, behavior: changed ? 'auto' : 'instant' });
    shownLevel.current = level;

    // If the window is resized, panel positions move; snap back to the current panel.
    const realign = () => container.scrollTo({ top: panel.offsetTop, behavior: 'instant' });
    window.addEventListener('resize', realign);
    return () => window.removeEventListener('resize', realign);
  }, [level]);

  const content: Record<Level, ReactNode> = {
    3: (
      <Placeholder persona={persona}>
        The AI will draft a full story card (title, chart, one-line takeaway), clearly marked as AI-written and
        editable.
      </Placeholder>
    ),
    2: (
      <Placeholder persona={persona}>
        Analytical paths: questions picked by the AI, each answered by a chart computed in code. Go deeper on any
        path to build a tree of questions.
      </Placeholder>
    ),
    1: map,
    0: explore,
  };

  return (
    <div className="assist" ref={containerRef}>
      {LEVELS.map(({ level: l, name }) => (
        <section
          key={l}
          className="panel"
          ref={(el) => {
            panelRefs.current[l] = el;
          }}
          aria-label={`Level ${l}: ${name}`}
          // Panels you can't see can't be tabbed into. Without this, focusing a hidden
          // button would make the browser scroll the column on its own.
          inert={l !== level}
        >
          <div className="panel-head">
            <span className="label">Level {l}</span>
            <h2 className="panel-title">{name}</h2>
          </div>
          {content[l]}
        </section>
      ))}
    </div>
  );
}

function Placeholder({ persona, children }: { persona: Persona; children: ReactNode }) {
  return (
    <div className="placeholder">
      <span className="label">Arrives in Phase 2</span>
      <p>{children}</p>
      <p>
        <span className="label">Tailored to</span> {describePersona(persona)}
      </p>
    </div>
  );
}

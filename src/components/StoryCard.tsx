import { useEffect, useMemo, useState } from 'react';
import type { Row } from '../aggregate';
import { chartForView } from '../paths';
import type { DataProfile } from '../profile';
import type { StoryCard as Card } from '../state';
import { Chart } from './Chart';

interface StoryCardProps {
  card: Card;
  profile: DataProfile;
  rows: Row[];
  onHighlight: (key: string) => void;
  onText: (title: string, takeaway: string) => void;
}

/**
 * The output of the whole app: a title, a chart, and a one-line takeaway. In Phase 1 the
 * user writes the text. Typing only changes local drafts; leaving a field sends the text
 * to app state, which saves one history step (D-009).
 */
export function StoryCard({ card, profile, rows, onHighlight, onText }: StoryCardProps) {
  const [title, setTitle] = useState(card.title);
  const [takeaway, setTakeaway] = useState(card.takeaway);

  // When back/forward restores a different card, show its text instead of the old draft.
  useEffect(() => setTitle(card.title), [card.title]);
  useEffect(() => setTakeaway(card.takeaway), [card.takeaway]);

  // The same function draws path previews, so a filtered chart on the card shows the same
  // numbers and the same "Only rows where…" note as it did in Level 2.
  const chart = useMemo(() => {
    if (card.fields.length === 0) return null;
    const view = { fields: card.fields, aggregate: card.aggregate, filter: card.filter };
    return chartForView(view, profile, rows, { highlight: card.highlight });
  }, [card.fields, card.aggregate, card.filter, card.highlight, profile, rows]);

  const commit = () => onText(title, takeaway);

  return (
    <aside className="story" aria-label="Story card">
      <span className="label">Story card</span>
      <div className="story-card">
        <input
          className="story-title"
          type="text"
          value={title}
          placeholder="Write a title"
          aria-label="Story title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
        />
        {chart ? (
          <>
            <div className="story-chart-head">
              <span className="label">{chart.title}</span>
              {card.source && (
                <span className={`source source-${card.source}`}>Suggested by {card.source === 'ai' ? 'AI' : 'rules'}</span>
              )}
            </div>
            <Chart spec={chart.spec} label={chart.title} onMarkClick={onHighlight} />
            {chart.notes.length > 0 && (
              <ul className="chart-notes">
                {chart.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="empty-note">Pick a chart in the middle column and choose “Use this”.</p>
        )}
        <textarea
          className="story-takeaway"
          value={takeaway}
          placeholder="Write the one-line takeaway"
          aria-label="Story takeaway"
          onChange={(e) => setTakeaway(e.target.value)}
          onBlur={commit}
        />
      </div>
      {chart && <p className="story-hint">Click a mark to highlight it. Click it again to clear.</p>}
    </aside>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
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
 * The output of the whole app: a title, a chart, and a one-line takeaway. The user writes
 * the text, or Level 3 drafts it; a drafted text carries an "AI draft" / "Rules draft"
 * marker until the user changes it (D-053). Typing only changes local drafts; leaving a
 * field sends the text to app state, which saves one history step (D-009).
 */
export function StoryCard({ card, profile, rows, onHighlight, onText }: StoryCardProps) {
  const [title, setTitle] = useState(card.title);
  const [takeaway, setTakeaway] = useState(card.takeaway);

  // Whether the user has typed in a field since its last commit. Refs, not state: they
  // only guard the effects below and never change what's drawn.
  const typedTitle = useRef(false);
  const typedTakeaway = useRef(false);

  // When back/forward or a Level 3 draft changes the card, show its text, unless the user
  // is in the middle of typing there: half-typed text is never replaced (D-053). On blur
  // the user's text is committed and becomes theirs.
  useEffect(() => {
    if (!typedTitle.current) setTitle(card.title);
  }, [card.title]);
  useEffect(() => {
    if (!typedTakeaway.current) setTakeaway(card.takeaway);
  }, [card.takeaway]);

  // The same function draws path previews, so a filtered chart on the card shows the same
  // numbers and the same "Only rows where…" note as it did in Level 2.
  const chart = useMemo(() => {
    if (card.fields.length === 0) return null;
    const view = { fields: card.fields, aggregate: card.aggregate, filters: card.filters };
    return chartForView(view, profile, rows, { highlight: card.highlight });
  }, [card.fields, card.aggregate, card.filters, card.highlight, profile, rows]);

  const commit = () => {
    typedTitle.current = false;
    typedTakeaway.current = false;
    onText(title, takeaway);
  };

  return (
    <aside className="story" aria-label="Story card">
      <span className="label">Story card</span>
      <div className="story-card">
        <TextMarker from={card.titleFrom} what="title" />
        <input
          className="story-title"
          type="text"
          value={title}
          placeholder="Write a title"
          aria-label="Story title"
          onChange={(e) => {
            typedTitle.current = true;
            setTitle(e.target.value);
          }}
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
        <TextMarker from={card.takeawayFrom} what="takeaway" />
        <textarea
          className="story-takeaway"
          value={takeaway}
          placeholder="Write the one-line takeaway"
          aria-label="Story takeaway"
          onChange={(e) => {
            typedTakeaway.current = true;
            setTakeaway(e.target.value);
          }}
          onBlur={commit}
        />
      </div>
      {chart && <p className="story-hint">Click a mark to highlight it. Click it again to clear.</p>}
    </aside>
  );
}

/** Shown above a text Level 3 drafted, until the user edits it and it becomes theirs. */
function TextMarker({ from, what }: { from: Card['titleFrom']; what: string }) {
  if (from !== 'ai' && from !== 'rules') return null;
  return (
    <span className={`source source-${from} text-marker`} title={`This ${what} was drafted by ${from === 'ai' ? 'the AI' : 'rules'}. Edit it to make it yours.`}>
      {from === 'ai' ? 'AI draft' : 'Rules draft'}
    </span>
  );
}

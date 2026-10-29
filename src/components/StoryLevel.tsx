import { useMemo } from 'react';
import type { Row } from '../aggregate';
import { chartForView } from '../paths';
import { describePersona, type Persona } from '../personas';
import type { DataProfile } from '../profile';
import type { CardDraft, StoryCard } from '../state';
import type { Draft } from '../story';
import { Chart } from './Chart';

export type DraftState = { status: 'waiting' } | { status: 'loading' } | { status: 'ready'; draft: Draft | null; retry: () => void };

interface StoryLevelProps {
  visible: boolean;
  persona: Persona;
  canTryAnother: boolean;
  draftState: DraftState;
  card: StoryCard;
  profile: DataProfile;
  rows: Row[];
  onUseDraft: (draft: CardDraft) => void;
  onAnotherAngle: (pathId: string) => void;
}

/**
 * Level 3 — Story: a drafted story card for a path. The AI (or the rules) writes the
 * words; every number in them was computed in code and filled into a slot. An untouched
 * card is filled automatically (App.tsx); a card with the user's own work keeps it, and the
 * draft waits here with "Use draft".
 */
export function StoryLevel(props: StoryLevelProps) {
  const { draftState, card } = props;
  return (
    <>
      <p className="suggest-persona">
        <span className="label">Tailored to</span> {describePersona(props.persona)}
      </p>

      {draftState.status === 'waiting' && <p className="notice">Waiting for Level 2’s paths…</p>}
      {draftState.status === 'loading' && (
        <>
          <p className="notice" role="status">
            Drafting a story…
          </p>
          <div className="path-card skeleton" aria-hidden="true">
            <span className="skeleton-line short" />
            <span className="skeleton-line" />
            <span className="skeleton-block" />
          </div>
        </>
      )}
      {draftState.status === 'ready' && !draftState.draft && <p className="empty-note">No path to draft a story from.</p>}
      {draftState.status === 'ready' && draftState.draft && (
        <DraftView {...props} draft={draftState.draft} retry={draftState.retry} card={card} />
      )}
    </>
  );
}

function DraftView(props: StoryLevelProps & { draft: Draft; retry: () => void }) {
  const { draft, card } = props;
  const onCard = card.path?.id === draft.path.id && card.title === draft.title && card.takeaway === draft.takeaway;
  const chosenBy = {
    active: 'the path you chose in Level 2',
    ai: 'the path the AI picked',
    rules: 'the path with the strongest check or largest change (picked by rules)',
  }[draft.pickedBy];
  const chart = useMemo(
    () => (props.visible && !onCard ? chartForView(draft.path, props.profile, props.rows, { highlight: null, height: 150 }) : null),
    [props.visible, onCard, draft.path, props.profile, props.rows],
  );
  const used = draft.slots.map((id) => draft.facts.find((f) => f.id === id)!).filter(Boolean);

  return (
    <>
      <p className="story-from">
        <span className="label">Drafting from</span> {chosenBy}:{' '}
        <span className="chip">{draft.path.kind}</span> {draft.path.question}
      </p>
      {draft.notice && (
        <p className="notice" role="status">
          {draft.notice}{' '}
          {draft.aiFailed && (
            <button type="button" className="link-btn" onClick={props.retry}>
              Try again
            </button>
          )}
        </p>
      )}

      <div className="path-card draft">
        <div className="path-tags">
          <span className={`source source-${draft.source}`}>{draft.source === 'ai' ? 'AI draft' : 'Rules draft'}</span>
        </div>
        <h3 className="path-question">{draft.title}</h3>
        <p className="draft-takeaway">{draft.takeaway}</p>
        {chart && <Chart spec={chart.spec} label={chart.title} />}
        {used.length > 0 && (
          // Every number above is one of these, computed in code (facts.ts).
          <details className="facts-used">
            <summary className="label">Facts used ({used.length})</summary>
            <ul>
              {used.map((f) => (
                <li key={f.id}>
                  {f.label}: <strong>{f.display}</strong>
                </li>
              ))}
            </ul>
          </details>
        )}
        {onCard ? (
          <p className="story-hint">On the story card. Edit its title or takeaway there; once you do, the text is yours.</p>
        ) : (
          <p className="story-hint">Your card has your own work, so this draft waits here instead of replacing it.</p>
        )}
        <div className="path-actions">
          <button
            type="button"
            className="btn"
            disabled={!props.canTryAnother}
            onClick={() => props.onAnotherAngle(draft.path.id)}
          >
            Try another angle
          </button>
          {!onCard && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => props.onUseDraft({ path: draft.path, title: draft.title, takeaway: draft.takeaway, source: draft.source })}
            >
              Use draft
            </button>
          )}
        </div>
      </div>
    </>
  );
}

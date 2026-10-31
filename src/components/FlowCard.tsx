import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isMissing, type Row } from '../aggregate';
import { buildCard, type Block } from '../card';
import { shownText } from '../cardAi';
import { SECTION_TITLES } from '../cardText';
import { chooseRule } from '../chartRules';
import type { DatasetFinding } from '../datasetFindings';
import { hasChart, type FlowNode } from '../flow';
import type { Highlight } from '../highlight';
import type { Option } from '../options';
import { MAX_FILTERS, chartForView, filterRows, type ChartView, type PathFilter } from '../paths';
import type { DataProfile } from '../profile';
import type { Roles } from '../roles';
import { useCardPhrasing } from '../useCardPhrasing';
import { Chart } from './Chart';

interface FlowCardProps {
  node: FlowNode;
  dataset: number; // which dataset load, for the AI phrasing cache
  options: Option[]; // the menu for this node's scope
  highlight: Highlight | null | undefined;
  datasetFindings: DatasetFinding[];
  profile: DataProfile;
  rows: Row[];
  roles: Roles;
  onDeeper: (filter: PathFilter) => void;
  onPick: (option: Option) => void;
  onEdit: (block: string, text: string) => void;
}

/**
 * The present card (SPEC "The flow", step 4): the question, the chart with the headline's
 * group in the accent, then Key talking points, Caution around these, If they ask, and What
 * this data can't tell you. Code writes every block from facts (card.ts); the AI may reword
 * some; every block is editable, and the user's words always win. A node with no question
 * yet shows a preview of the highlighted question instead.
 */
export function FlowCard(props: FlowCardProps) {
  return hasChart(props.node) ? <Answer {...props} /> : <Preview {...props} />;
}

function Answer({ node, dataset, options, datasetFindings, profile, rows, roles, onDeeper, onEdit }: FlowCardProps) {
  const card = useMemo(() => buildCard(node.view, profile, rows, roles, datasetFindings), [node.view, profile, rows, roles, datasetFindings]);
  const chart = useMemo(() => chartForView(node.view, profile, rows, { highlight: card.highlight }), [node.view, profile, rows, card.highlight]);
  const question = options.find((o) => o.id === node.optionId)?.question ?? chart?.title ?? node.view.fields.join(' + ');
  const phrasing = useCardPhrasing(dataset, node.view, node.persona, card, question, profile);
  const ai = phrasing?.texts ?? {};
  const deeper = barColumn(node.view, profile);
  const full = node.view.filters.length >= MAX_FILTERS;

  // A bar click narrows to that group. "Other" (several small groups combined) isn't one
  // group, so it can't be a filter: only values the slice really has go deeper.
  const onBar = (key: string) => {
    if (!deeper || full) return;
    const slice = filterRows(rows, node.view.filters);
    if (slice.some((r) => !isMissing(r[deeper]) && r[deeper].trim() === key)) onDeeper({ field: deeper, value: key });
  };
  // Keyed by node and block: another question gets fresh text boxes, so a half-typed or
  // stale text can never carry over from one node to the next.
  const text = (b: Block, className?: string, quoted = false) => (
    <Editable key={`${node.id}:${b.id}`} block={b} ai={ai} edits={node.edits} onEdit={onEdit} className={className} quoted={quoted} />
  );

  return (
    <article className="card" aria-label="Question">
      <h1 className="card-title">{question}</h1>
      {deeper && (
        <p className="card-sub">{full ? `This is ${MAX_FILTERS} filters deep, the most a question can narrow.` : 'Click a bar to go deeper into that group.'}</p>
      )}
      {chart ? (
        <>
          <Chart spec={chart.spec} label={chart.title} onMarkClick={deeper && !full ? onBar : undefined} />
          {chart.notes.length > 0 && (
            <ul className="chart-notes">
              {chart.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="empty-note">No chart for {node.view.fields.join(' + ')}. Try a different pair.</p>
      )}

      {card.datasetLine && <div className="card-dataset">{text(card.datasetLine)}</div>}

      <Section title={SECTION_TITLES.talk}>
        {text(card.headline, 'card-headline')}
        {card.points.length > 0 && (
          <ul className="card-points">
            {card.points.map((p) => (
              <li key={p.id}>{text(p)}</li>
            ))}
          </ul>
        )}
      </Section>

      {card.cautions.length > 0 && (
        <Section title={SECTION_TITLES.caution}>
          {card.cautions.map((c) => (
            <div key={c.group} className="caution">
              <span className="label">Tempting to say</span>
              {text(c.claim, 'caution-claim', true)}
              <span className="label">Why to be careful</span>
              <ul className="caution-whys">
                {c.whys.map((w) => (
                  <li key={w.id}>{text(w)}</li>
                ))}
              </ul>
              {/* When it's the same sentence as the headline, saying it twice adds nothing. */}
              {c.instead.text !== card.headline.text && (
                <>
                  <span className="label">Say instead</span>
                  {text(c.instead)}
                </>
              )}
            </div>
          ))}
        </Section>
      )}

      {card.asks.length > 0 && (
        <Section title={SECTION_TITLES.ask}>
          {card.asks.map((a) => (
            <div key={a.question.id} className="ask">
              {text(a.question, 'ask-question')}
              {text(a.answer)}
            </div>
          ))}
        </Section>
      )}

      <Section title={SECTION_TITLES.cannot}>{card.cannot.map((c) => text(c))}</Section>

      {phrasing?.notice && <p className="notice">{phrasing.notice}</p>}
    </article>
  );
}

/**
 * One block of card text, editable in place. Typing stays local; leaving the field saves
 * the edit on the node. While the user is typing, nothing replaces what they're writing.
 */
function Editable(props: {
  block: Block;
  ai: Record<string, string>;
  edits: Record<string, string>;
  onEdit: (block: string, text: string) => void;
  className?: string;
  quoted?: boolean; // the tempting claim: shown in quotes
}) {
  const { block, ai, edits, onEdit, className, quoted } = props;
  const shown = shownText(block, ai, edits);
  const [draft, setDraft] = useState(shown.text);
  const typing = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!typing.current) setDraft(shown.text);
  }, [shown.text]);
  // Grow the box to fit its text, before the browser paints, so it reads like a paragraph.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const commit = () => {
    typing.current = false;
    if (draft !== shown.text) onEdit(block.id, draft);
  };
  return (
    <span className={`editable ${className ?? ''}`}>
      {shown.from === 'ai' && <span className="source source-ai" title="Worded by the AI from the same facts. Edit it to make it yours.">AI</span>}
      {quoted && <span aria-hidden="true">“</span>}
      <textarea
        ref={box}
        value={draft}
        rows={1}
        aria-label="Card text (editable)"
        onChange={(e) => {
          typing.current = true;
          setDraft(e.target.value);
        }}
        onBlur={commit}
      />
      {quoted && <span aria-hidden="true">”</span>}
    </span>
  );
}

function Preview({ options, highlight, datasetFindings, profile, rows, roles, onPick }: FlowCardProps) {
  const option = highlight ? options.find((o) => o.id === highlight.id) : undefined;
  const chart = useMemo(() => {
    if (!option) return null;
    const mark = buildCard(option.view, profile, rows, roles, datasetFindings).highlight;
    return chartForView(option.view, profile, rows, { highlight: mark });
  }, [option, profile, rows, roles, datasetFindings]);

  if (options.length === 0) {
    return (
      <article className="card">
        <p className="empty-note">No ready-made questions fit this slice. Build your own chart from the menu.</p>
      </article>
    );
  }
  if (!option) {
    return (
      <article className="card">
        <p className="empty-note">Choosing where to start…</p>
      </article>
    );
  }
  return (
    <article className="card card-preview" aria-label="Preview">
      <span className="label">Preview</span>
      <h1 className="card-title">{option.question}</h1>
      {chart && <Chart spec={chart.spec} label={chart.title} />}
      <div className="card-actions">
        <button type="button" className="btn btn-primary" onClick={() => onPick(option)}>
          Use this question
        </button>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-section">
      <h2 className="card-section-title">{title}</h2>
      {children}
    </section>
  );
}

/** The category column a bar click filters on, or null when the chart has no bars. */
function barColumn(view: ChartView, profile: DataProfile): string | null {
  const cols = view.fields.map((n) => profile.columns.find((c) => c.name === n));
  if (cols.some((c) => !c)) return null;
  const rule = chooseRule(cols.map((c) => c!.type));
  if (rule !== 'sorted-bars' && rule !== 'count-bars') return null;
  return cols.find((c) => c!.type === 'nominal')!.name;
}

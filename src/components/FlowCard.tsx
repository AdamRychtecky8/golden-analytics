import { useMemo } from 'react';
import { isMissing, type Row } from '../aggregate';
import { chooseRule } from '../chartRules';
import { runChecks } from '../checks';
import { hasChart, type FlowNode } from '../flow';
import type { Highlight } from '../highlight';
import type { Option } from '../options';
import { MAX_FILTERS, chartForView, filterRows, type ChartView, type PathFilter } from '../paths';
import type { DataProfile } from '../profile';
import type { Roles } from '../roles';
import { Chart } from './Chart';

interface FlowCardProps {
  node: FlowNode;
  options: Option[]; // the menu for this node's scope
  highlight: Highlight | null | undefined;
  profile: DataProfile;
  rows: Row[];
  roles: Roles;
  onDeeper: (filter: PathFilter) => void;
  onPick: (option: Option) => void;
}

/**
 * The one card (SPEC "The flow", step 4): the question as its title, the chart as the hero,
 * then four sections. A node with no question yet (the root, or a slice just made by going
 * deeper) shows a preview of the highlighted question instead, which becomes a node only
 * when picked.
 */
export function FlowCard(props: FlowCardProps) {
  return hasChart(props.node) ? <Answer {...props} /> : <Preview {...props} />;
}

function Answer({ node, options, profile, rows, roles, onDeeper }: FlowCardProps) {
  const chart = useMemo(() => chartForView(node.view, profile, rows, { highlight: null }), [node.view, profile, rows]);
  const findings = useMemo(() => runChecks(node.view, profile, rows, roles).findings, [node.view, profile, rows, roles]);
  const question = options.find((o) => o.id === node.optionId)?.question ?? chart?.title ?? node.view.fields.join(' + ');
  const deeper = barColumn(node.view, profile);
  const full = node.view.filters.length >= MAX_FILTERS;

  // A bar click narrows to that group. "Other" (several small groups combined) isn't one
  // group, so it can't be a filter: only values the slice really has go deeper.
  const onBar = (key: string) => {
    if (!deeper || full) return;
    const slice = filterRows(rows, node.view.filters);
    if (slice.some((r) => !isMissing(r[deeper]) && r[deeper].trim() === key)) onDeeper({ field: deeper, value: key });
  };

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

      <Section title="Say this">
        <Later>Phase 5: a headline and two or three talking points.</Later>
      </Section>
      <Section title="Don't say this" draft>
        {findings.length === 0 ? (
          <p className="empty-note">No check caught anything on this chart.</p>
        ) : (
          <ul className="findings">
            {findings.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="If they ask">
        <Later>Phase 5</Later>
      </Section>
      <Section title="What this data can't tell you">
        <Later>Phase 5 · always shown</Later>
      </Section>
    </article>
  );
}

function Preview({ options, highlight, profile, rows, onPick }: FlowCardProps) {
  const option = highlight ? options.find((o) => o.id === highlight.id) : undefined;
  const chart = useMemo(() => (option ? chartForView(option.view, profile, rows, { highlight: null }) : null), [option, profile, rows]);

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

function Section({ title, draft, children }: { title: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <section className="card-section">
      <h2 className="card-section-title">
        {title}
        {draft && <span className="label card-draft">Draft</span>}
      </h2>
      {children}
    </section>
  );
}

const Later = ({ children }: { children: React.ReactNode }) => <p className="card-later">{children}</p>;

/** The category column a bar click filters on, or null when the chart has no bars. */
function barColumn(view: ChartView, profile: DataProfile): string | null {
  const cols = view.fields.map((n) => profile.columns.find((c) => c.name === n));
  if (cols.some((c) => !c)) return null;
  const rule = chooseRule(cols.map((c) => c!.type));
  if (rule !== 'sorted-bars' && rule !== 'count-bars') return null;
  return cols.find((c) => c!.type === 'nominal')!.name;
}

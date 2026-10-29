import { useMemo } from 'react';
import type { Aggregate, Row } from '../aggregate';
import { buildChart, canSum, chartIdeas, effectiveAggregate, usesAggregate } from '../chartRules';
import type { ColumnProfile, DataProfile } from '../profile';
import { Chart } from './Chart';

// Shared props for the two non-AI levels. Both read the same selection (D-008:
// selections carry across levels), so switching between them never loses work.
interface LevelProps {
  profile: DataProfile;
  rows: Row[];
  selected: string[];
  aggregate: Aggregate;
  cardFields: string[];
  onToggleField: (field: string) => void;
  onSelectFields: (fields: string[]) => void;
  onAggregate: (aggregate: Aggregate) => void;
  onUseChart: () => void;
  // Only the level the slider is on builds and draws its chart; hidden levels stay light.
  visible: boolean;
}

const TYPE_LABEL: Record<ColumnProfile['type'], string> = {
  nominal: 'category',
  quantitative: 'number',
  temporal: 'date',
};

/** Level 0 — Explore: every field, no guidance. Click fields to build a chart. */
export function ExploreLevel(props: LevelProps) {
  return (
    <>
      <div className="section">
        <span className="label">Fields · pick up to 2</span>
        <ul className="field-list">
          {props.profile.columns.map((c) => {
            const order = props.selected.indexOf(c.name);
            return (
              <li key={c.name}>
                <button
                  type="button"
                  className="field-chip"
                  aria-pressed={order >= 0}
                  onClick={() => props.onToggleField(c.name)}
                >
                  {c.name}
                  <span className="field-type">{TYPE_LABEL[c.type]}</span>
                  {order >= 0 && <span className="field-type">#{order + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <ChartPreview {...props} />
    </>
  );
}

/** Level 1 — Map: field cards with a quick profile, plus rule-based chart ideas. */
export function MapLevel(props: LevelProps) {
  const selectedCols = props.selected.map((n) => props.profile.columns.find((c) => c.name === n)!);
  const ideas = chartIdeas(selectedCols, props.profile.columns, props.aggregate);
  const same = (fields: string[]) => fields.join('|') === props.selected.join('|');

  return (
    <>
      <div className="section">
        <span className="label">Fields · {props.profile.rowCount} rows</span>
        <div className="field-cards">
          {props.profile.columns.map((c) => (
            <FieldCard
              key={c.name}
              column={c}
              selected={props.selected.includes(c.name)}
              onClick={() => props.onToggleField(c.name)}
            />
          ))}
        </div>
      </div>

      <div className="section">
        <span className="label">{props.selected.length === 0 ? 'What you can show' : 'What you can show with this'}</span>
        <ul className="ideas">
          {ideas.map((idea) => (
            <li key={idea.fields.join('|')}>
              <button
                type="button"
                className="idea"
                aria-pressed={same(idea.fields)}
                onClick={() => props.onSelectFields(idea.fields)}
              >
                <span>{idea.title}</span>
                <span className="field-type">{idea.fields.join(' + ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ChartPreview {...props} />
    </>
  );
}

function FieldCard({ column: c, selected, onClick }: { column: ColumnProfile; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className="field-card" aria-pressed={selected} onClick={onClick}>
      <span className="field-type">
        {TYPE_LABEL[c.type]}
        {c.measure === 'average' && ' · average only'}
      </span>
      <span className="field-card-name">{c.name}</span>
      <span className="field-card-stat">{rangeText(c)}</span>
      <span className="field-card-stat">
        {c.distinct} distinct · {c.missing} missing
      </span>
      <MiniDistribution column={c} />
    </button>
  );
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const date = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

function rangeText(c: ColumnProfile): string {
  if (c.count === 0) return 'no values';
  if (c.type === 'quantitative') return `${num.format(c.min!)} – ${num.format(c.max!)}`;
  if (c.type === 'temporal') return `${date(c.min!)} – ${date(c.max!)}`;
  return `top: ${c.topValues![0].value}`;
}

/** A tiny, unlabeled sketch of the column's shape: bins for numbers and dates, top values for categories. */
function MiniDistribution({ column: c }: { column: ColumnProfile }) {
  if (c.type === 'nominal') {
    const top = c.topValues!.slice(0, 3);
    const max = top[0]?.count ?? 1;
    return (
      <div className="mini-dist-cats" aria-hidden="true">
        {top.map((v) => (
          <div key={v.value} className="mini-dist-cat">
            <span>{v.value}</span>
            <i style={{ width: `${(v.count / max) * 100}%` }} />
          </div>
        ))}
        {c.distinct > 3 && <span className="field-card-stat">+{c.distinct - 3} more</span>}
      </div>
    );
  }
  const bins = c.bins ?? [];
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="mini-dist" aria-hidden="true">
      {bins.map((b, i) => (
        <span key={i} style={{ height: `${(b.count / max) * 100}%` }} />
      ))}
    </div>
  );
}

/** The chart for the current selection, with the sum/mean toggle and "Use this". */
function ChartPreview(props: LevelProps) {
  const { profile, rows, selected, aggregate, visible } = props;
  const cols = useMemo(() => selected.map((n) => profile.columns.find((c) => c.name === n)!), [profile, selected]);
  // Rebuild the chart only when its inputs change; a new spec object makes Vega redraw.
  // Levels 0 and 1 share this preview, so without `visible` it was built and drawn twice.
  const chart = useMemo(
    () => (visible ? buildChart(cols, rows, { aggregate, highlight: null }) : null),
    [visible, cols, rows, aggregate],
  );
  // What the chart really shows: a sum of an average-only number is drawn as a mean.
  const shown = effectiveAggregate(cols, aggregate);
  const summable = canSum(cols);

  if (selected.length === 0) {
    return (
      <div className="preview">
        <p className="empty-note">Click a field to start a chart.</p>
      </div>
    );
  }
  if (!visible) return <div className="preview preview-hidden" aria-hidden="true" />;
  if (!chart) {
    return (
      <div className="preview">
        <p className="empty-note">No chart for {selected.join(' + ')} yet. Try a different pair.</p>
      </div>
    );
  }

  const onCard = props.cardFields.join('|') === selected.join('|');
  return (
    <div className="preview">
      <div className="preview-head">
        <span className="preview-title">{chart.title}</span>
        {usesAggregate(chart.rule) && (
          <span className="toggle" role="group" aria-label="Combine values by">
            {(['sum', 'mean'] as const).map((a) => (
              <button
                key={a}
                type="button"
                className="btn"
                aria-pressed={shown === a}
                disabled={a === 'sum' && !summable}
                title={a === 'sum' && !summable ? 'This number is average only: adding it up means nothing' : undefined}
                onClick={() => props.onAggregate(a)}
              >
                {a}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="btn btn-primary" onClick={props.onUseChart}>
          {onCard ? 'Update card' : 'Use this →'}
        </button>
      </div>
      <Chart spec={chart.spec} label={chart.title} />
      {chart.notes.length > 0 && (
        <ul className="chart-notes">
          {chart.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from 'react';
import { currentNode, nodeById, nodeLabel, pathTo, questionsExplored, type FlowNode, type FlowState, type LabelContext } from '../flow';
import { layoutMap, moreId, type MapItem } from '../mapLayout';
import { personaColor, personaInitial } from '../personas';

// The map of everything explored (SPEC "The flow", step 5), as in the wireframe. Collapsed
// by default to one line: the path to the current question. Expanded: the whole tree, left
// to right, one column per depth. Positions come from layoutMap (pure, tested); this
// component only draws them.

const NODE_W = 200;
const NODE_H = 36;
const GAP_X = 30;
const GAP_Y = 24;
const MAX_ROWS = 5; // past this, branches off the current path fold into "+N"

interface FlowMapProps {
  state: FlowState;
  labels: LabelContext;
  onJump: (id: string) => void;
}

export function FlowMap({ state, labels, onJump }: FlowMapProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const current = currentNode(state);
  const count = questionsExplored(state);
  const explored = `${count} ${count === 1 ? 'question' : 'questions'} explored`;

  if (!open) {
    return (
      <nav className="map map-collapsed" aria-label="Your thinking so far">
        <ol className="map-path">
          {pathTo(state, current.id).map((n) => (
            <li key={n.id}>
              <button type="button" className="map-crumb" aria-current={n.id === current.id ? 'step' : undefined} onClick={() => onJump(n.id)}>
                <Dot node={n} />
                {nodeLabel(n, labels)}
              </button>
            </li>
          ))}
        </ol>
        <span className="map-count">{explored}</span>
        <button type="button" className="link-btn" aria-expanded={false} onClick={() => setOpen(true)}>
          Expand ▼
        </button>
      </nav>
    );
  }

  const layout = layoutMap(state.nodes, current.id, expanded, MAX_ROWS);
  const x = (depth: number) => depth * (NODE_W + GAP_X);
  const y = (row: number) => row * (NODE_H + GAP_Y);
  const where = new Map(layout.items.map((i) => [i.kind === 'node' ? i.id : moreId(i.parentId), i]));
  const width = layout.depths * (NODE_W + GAP_X) - GAP_X;
  const height = layout.rows * (NODE_H + GAP_Y) - GAP_Y;

  return (
    <nav className="map map-open" aria-label="Your thinking so far">
      <div className="map-head">
        <span className="label">Your thinking so far · {explored}</span>
        <button type="button" className="link-btn" aria-expanded={true} onClick={() => setOpen(false)}>
          Collapse ▲
        </button>
      </div>
      <div className="map-scroll">
        <div className="map-canvas" style={{ width, height }}>
          {/* Lines first, so the nodes sit on top of them. */}
          <svg className="map-edges" width={width} height={height} aria-hidden="true">
            {layout.edges.map((e) => {
              const from = where.get(e.from)!;
              const to = where.get(e.to)!;
              const [x1, y1] = [x(from.depth) + NODE_W, y(from.row) + NODE_H / 2];
              const [x2, y2] = [x(to.depth), y(to.row) + NODE_H / 2];
              const mid = (x1 + x2) / 2;
              return <path key={`${e.from}-${e.to}`} d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`} className={e.dashed ? 'map-edge map-edge-dashed' : 'map-edge'} />;
            })}
          </svg>
          {layout.items.map((item) => (
            <MapBox
              key={item.kind === 'node' ? item.id : moreId(item.parentId)}
              item={item}
              state={state}
              labels={labels}
              current={item.kind === 'node' && item.id === current.id}
              style={{ left: x(item.depth), top: y(item.row) }}
              onJump={onJump}
              onOpen={(parentId) => setExpanded((s) => new Set([...s, parentId]))}
            />
          ))}
        </div>
      </div>
      <p className="map-legend">
        Solid line: new question, go deeper, or build my own · Dashed line: persona switch · Dashed box: a slice (no chart of its own) · "+N": a folded
        branch, click to open · Click any question to go back to it
      </p>
    </nav>
  );
}

interface MapBoxProps {
  item: MapItem;
  state: FlowState;
  labels: LabelContext;
  current: boolean;
  style: { left: number; top: number };
  onJump: (id: string) => void;
  onOpen: (parentId: string) => void;
}

function MapBox({ item, state, labels, current, style, onJump, onOpen }: MapBoxProps) {
  if (item.kind === 'more') {
    return (
      <button type="button" className="map-more" style={style} onClick={() => onOpen(item.parentId)} title={`Show ${item.count} more`}>
        +{item.count}
      </button>
    );
  }
  const node = nodeById(state, item.id);
  const { color, tint } = node.how === 'root' ? { color: '#8a8a8a', tint: '#ecebe6' } : personaColor(node.persona);
  const label = nodeLabel(node, labels);
  const slice = node.how === 'deeper';
  return (
    <button
      type="button"
      className={`map-node${slice ? ' map-node-slice' : ''}`}
      style={{ ...style, width: NODE_W, height: NODE_H, background: slice ? undefined : tint, borderColor: color }}
      aria-current={current ? 'step' : undefined}
      title={`${label} (${node.persona.name})`}
      onClick={() => onJump(node.id)}
    >
      {node.how !== 'root' && <Dot node={node} />}
      <span className="map-node-label">{label}</span>
    </button>
  );
}

/** The persona's color with its initial, so color is never the only signal. */
function Dot({ node }: { node: FlowNode }) {
  if (node.how === 'root') return <span className="map-dot" style={{ background: '#8a8a8a' }} aria-hidden="true" />;
  return (
    <span className="map-dot" style={{ background: personaColor(node.persona).color }} title={node.persona.name}>
      <span aria-hidden="true">{personaInitial(node.persona)}</span>
      <span className="visually-hidden">{node.persona.name}: </span>
    </span>
  );
}

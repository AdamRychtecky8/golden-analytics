// Where each node of the flow tree goes on the map, as plain numbers: one column per depth
// (left to right), one row per line of the tree. Pure, so it is tested without a browser;
// the FlowMap component only draws what this returns.
//
// When the tree needs more rows than the map has room for, the branches that are not on
// the current path are folded into a "+N" marker per parent (N = how many nodes it hides).
// The current path is never folded. Clicking a marker adds its parent to `expanded`.

export interface LayoutNode {
  id: string;
  parentId: string | null;
  how: string; // only 'persona' matters here: its line is dashed
}

export type MapItem =
  | { kind: 'node'; id: string; depth: number; row: number; onPath: boolean }
  | { kind: 'more'; parentId: string; count: number; depth: number; row: number };

export interface MapEdge {
  from: string; // a node id
  to: string; // a node id, or "more:<parentId>" for a marker
  dashed: boolean; // a persona switch
}

export interface MapLayout {
  items: MapItem[];
  edges: MapEdge[];
  rows: number;
  depths: number;
  folded: boolean; // whether any branch was folded to fit
}

export const moreId = (parentId: string) => `more:${parentId}`;

export function layoutMap(nodes: LayoutNode[], currentId: string, expanded: ReadonlySet<string>, maxRows: number): MapLayout {
  const children = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const onPath = new Set<string>();
  for (let n = byId.get(currentId); n; n = n.parentId ? byId.get(n.parentId) : undefined) onPath.add(n.id);
  const size = (id: string): number => 1 + (children.get(id) ?? []).reduce((s, c) => s + size(c.id), 0);

  const place = (fold: boolean): MapLayout => {
    const items: MapItem[] = [];
    const edges: MapEdge[] = [];
    let nextRow = 0;
    let depths = 0;
    let folded = false;

    // Places a node and everything shown under it; returns the node's row. A parent sits on
    // its first child's row, so a chain of single children reads as one straight line.
    const visit = (n: LayoutNode, depth: number): number => {
      depths = Math.max(depths, depth + 1);
      const item: MapItem = { kind: 'node', id: n.id, depth, row: 0, onPath: onPath.has(n.id) };
      items.push(item);
      const kids = children.get(n.id) ?? [];
      const foldHere = fold && !expanded.has(n.id);
      const shown = foldHere ? kids.filter((c) => onPath.has(c.id)) : kids;
      const hidden = kids.filter((c) => !shown.includes(c));

      const rows: number[] = [];
      for (const c of shown) {
        rows.push(visit(c, depth + 1));
        edges.push({ from: n.id, to: c.id, dashed: c.how === 'persona' });
      }
      if (hidden.length > 0) {
        folded = true;
        const row = nextRow++;
        items.push({ kind: 'more', parentId: n.id, count: hidden.reduce((s, c) => s + size(c.id), 0), depth: depth + 1, row });
        edges.push({ from: n.id, to: moreId(n.id), dashed: false });
        depths = Math.max(depths, depth + 2);
        rows.push(row);
      }
      item.row = rows.length > 0 ? rows[0] : nextRow++;
      return item.row;
    };

    const root = nodes.find((n) => n.parentId === null);
    if (root) visit(root, 0);
    return { items, edges, rows: nextRow, depths, folded };
  };

  const full = place(false);
  return full.rows <= maxRows ? full : place(true);
}

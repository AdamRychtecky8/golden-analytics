import { describe, expect, it } from 'vitest';
import { layoutMap, type LayoutNode, type MapItem } from './mapLayout';

// A small tree, written as parent links:
//   n0 ─┬─ n1 ─── n3 ─┄─ n5 (persona)
//       ├─ n2 ─── n4
//       └─ n6 ─┬─ n7
//              └─ n8
const tree: LayoutNode[] = [
  { id: 'n0', parentId: null, how: 'root' },
  { id: 'n1', parentId: 'n0', how: 'pick' },
  { id: 'n2', parentId: 'n0', how: 'pick' },
  { id: 'n3', parentId: 'n1', how: 'deeper' },
  { id: 'n4', parentId: 'n2', how: 'deeper' },
  { id: 'n5', parentId: 'n3', how: 'persona' },
  { id: 'n6', parentId: 'n0', how: 'pick' },
  { id: 'n7', parentId: 'n6', how: 'deeper' },
  { id: 'n8', parentId: 'n6', how: 'custom' },
];
const none = new Set<string>();
const at = (items: MapItem[], id: string) => items.find((i) => i.kind === 'node' && i.id === id)!;
const nodeIds = (items: MapItem[]) => items.flatMap((i) => (i.kind === 'node' ? [i.id] : []));
const markers = (items: MapItem[]) => items.flatMap((i) => (i.kind === 'more' ? [{ parentId: i.parentId, count: i.count }] : []));

describe('layoutMap with room for everything', () => {
  const l = layoutMap(tree, 'n5', none, 10);

  it('puts each node in the column of its depth', () => {
    expect(['n0', 'n1', 'n3', 'n5'].map((id) => at(l.items, id).depth)).toEqual([0, 1, 2, 3]);
    expect(['n2', 'n6', 'n4', 'n7', 'n8'].map((id) => at(l.items, id).depth)).toEqual([1, 1, 2, 2, 2]);
    expect(l.depths).toBe(4);
  });

  it('gives each leaf its own row, and a parent its first child\'s row', () => {
    expect(['n5', 'n4', 'n7', 'n8'].map((id) => at(l.items, id).row)).toEqual([0, 1, 2, 3]);
    expect(['n0', 'n1', 'n3'].map((id) => at(l.items, id).row)).toEqual([0, 0, 0]); // one straight line
    expect(at(l.items, 'n6').row).toBe(2);
    expect(l.rows).toBe(4);
    expect(l.folded).toBe(false);
  });

  it('draws persona switches dashed and everything else solid', () => {
    expect(l.edges.filter((e) => e.dashed)).toEqual([{ from: 'n3', to: 'n5', dashed: true }]);
    expect(l.edges).toHaveLength(8);
  });

  it('marks the current path', () => {
    expect(l.items.filter((i) => i.kind === 'node' && i.onPath).map((i) => (i as { id: string }).id)).toEqual(['n0', 'n1', 'n3', 'n5']);
  });
});

describe('layoutMap when the tree is taller than the map', () => {
  it('never folds the current path, and folds the other branches into "+N" with the right counts', () => {
    const l = layoutMap(tree, 'n5', none, 2);
    expect(l.folded).toBe(true);
    // The whole path to n5 is shown.
    expect(nodeIds(l.items)).toEqual(['n0', 'n1', 'n3', 'n5']);
    // n2 and n4, then n6, n7, n8: five nodes folded under the root.
    expect(markers(l.items)).toEqual([{ parentId: 'n0', count: 5 }]);
  });

  it('folds under every node of the path, deep as well as shallow', () => {
    const l = layoutMap(tree, 'n7', none, 2);
    expect(nodeIds(l.items)).toEqual(['n0', 'n6', 'n7']);
    // A marker comes after its parent's shown children, so n6's comes before the root's.
    expect(markers(l.items)).toEqual([
      { parentId: 'n6', count: 1 }, // n8
      { parentId: 'n0', count: 5 }, // n1, n3, n5, n2, n4
    ]);
  });

  it('shows a folded branch once its marker is opened', () => {
    const l = layoutMap(tree, 'n7', new Set(['n6']), 2);
    expect(nodeIds(l.items)).toEqual(['n0', 'n6', 'n7', 'n8']);
    expect(markers(l.items)).toEqual([{ parentId: 'n0', count: 5 }]);
  });

  it('keeps the path visible however small the map is', () => {
    for (const current of tree.map((n) => n.id)) {
      const l = layoutMap(tree, current, none, 1);
      const path: string[] = [];
      for (let n = tree.find((x) => x.id === current); n; n = tree.find((x) => x.id === n!.parentId)) path.push(n.id);
      expect(nodeIds(l.items)).toEqual(expect.arrayContaining(path));
      // Every node is either shown or counted in exactly one marker.
      expect(nodeIds(l.items).length + markers(l.items).reduce((s, m) => s + m.count, 0)).toBe(tree.length);
    }
  });

  it('a single root is one row', () => {
    expect(layoutMap([tree[0]], 'n0', none, 3)).toMatchObject({ rows: 1, depths: 1, folded: false });
  });
});

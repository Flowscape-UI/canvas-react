import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';
import type { CanvasStore } from './store';

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    centerAddIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
  } as Partial<CanvasStore>);
}

describe('Grouping: data and movement semantics', () => {
  beforeEach(() => resetStore());

  it('groupNodes(parent, children) assigns parentId and ignores invalid/self ids', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'p', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 5, y: 5, width: 10, height: 10 });

    // include non-existing id and self id
    useCanvasStore.getState().groupNodes('p', ['c1', 'nope', 'p']);

    const s = useCanvasStore.getState();
    expect(s.nodes['c1']).toBeDefined();
    expect(s.nodes['c1']?.parentId).toBe('p');
    // parent must not change
    expect(s.nodes['p']?.parentId).toBeUndefined();
  });

  it('prevents cycles: cannot set a descendant as parent of its ancestor', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'b', x: 1, y: 1, width: 10, height: 10 });
    add({ id: 'c', x: 2, y: 2, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('a', ['b']); // a -> b
    useCanvasStore.getState().groupNodes('b', ['c']); // b -> c

    // attempt to make c parent of a -> would create cycle a->b->c->a, must be ignored
    useCanvasStore.getState().groupNodes('c', ['a']);

    const s = useCanvasStore.getState();
    expect(s.nodes['a']?.parentId).toBeUndefined();
    expect(s.nodes['b']?.parentId).toBe('a');
    expect(s.nodes['c']?.parentId).toBe('b');
  });

  it('moveSelectedBy moves selected parents along with all descendants exactly once', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'p', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 5, y: 5, width: 10, height: 10 });
    add({ id: 'c2', x: 7, y: -1, width: 10, height: 10 });
    add({ id: 'g1', x: 8, y: 8, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('p', ['c1', 'c2']);
    useCanvasStore.getState().groupNodes('c1', ['g1']); // grandchild

    // select both parent and one child; descendants should still move once
    useCanvasStore.getState().selectOnly('p');
    useCanvasStore.getState().addToSelection('c1');

    useCanvasStore.getState().moveSelectedBy(3, 4);

    const s = useCanvasStore.getState();
    expect(s.nodes['p']).toMatchObject({ x: 3, y: 4 });
    expect(s.nodes['c1']).toMatchObject({ x: 8, y: 9 });
    expect(s.nodes['c2']).toMatchObject({ x: 10, y: 3 });
    expect(s.nodes['g1']).toMatchObject({ x: 11, y: 12 });
  });

  it('ungroup(ids) clears parentId only for provided ids', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'p', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 5, y: 5, width: 10, height: 10 });
    add({ id: 'c2', x: 7, y: 7, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('p', ['c1', 'c2']);
    useCanvasStore.getState().ungroup(['c1']);

    const s = useCanvasStore.getState();
    expect(s.nodes['c1']?.parentId).toBeNull();
    expect(s.nodes['c2']?.parentId).toBe('p');
  });

  it('removeNode(parent) clears parentId for its immediate children', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'p', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 5, y: 5, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('p', ['c1']);
    useCanvasStore.getState().removeNode('p');

    const s = useCanvasStore.getState();
    expect(s.nodes['p']).toBeUndefined();
    expect(s.nodes['c1']).toBeDefined();
    expect(s.nodes['c1']?.parentId).toBeNull();
  });
});

describe('Grouping: deleteSelected semantics', () => {
  beforeEach(() => resetStore());

  it('deleting only children leaves root intact', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'root', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 10, y: 0, width: 10, height: 10 });
    add({ id: 'c2', x: 20, y: 0, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('root', ['c1', 'c2']);

    // select only children
    useCanvasStore.getState().selectOnly('c1');
    useCanvasStore.getState().addToSelection('c2');
    useCanvasStore.getState().deleteSelected();

    const s = useCanvasStore.getState();
    expect(s.nodes['root']).toBeDefined();
    expect(s.nodes['c1']).toBeUndefined();
    expect(s.nodes['c2']).toBeUndefined();
  });

  it('deleting root + children removes them all', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'root', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'c1', x: 10, y: 0, width: 10, height: 10 });
    add({ id: 'c2', x: 20, y: 0, width: 10, height: 10 });
    add({ id: 'g1', x: 30, y: 0, width: 10, height: 10 });

    useCanvasStore.getState().groupNodes('root', ['c1', 'c2']);
    useCanvasStore.getState().groupNodes('c1', ['g1']);

    // explicitly select root and all descendants
    useCanvasStore.getState().selectOnly('root');
    useCanvasStore.getState().addToSelection('c1');
    useCanvasStore.getState().addToSelection('c2');
    useCanvasStore.getState().addToSelection('g1');
    useCanvasStore.getState().deleteSelected();

    const s = useCanvasStore.getState();
    expect(s.nodes['root']).toBeUndefined();
    expect(s.nodes['c1']).toBeUndefined();
    expect(s.nodes['c2']).toBeUndefined();
    expect(s.nodes['g1']).toBeUndefined();
  });
});

describe('Grouping: history integration (undo/redo)', () => {
  beforeEach(() => resetStore());

  it('records group/ungroup as updates and supports undo/redo', () => {
    useCanvasStore.getState().addNode({ id: 'p', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().addNode({ id: 'c', x: 1, y: 1, width: 10, height: 10 });

    // group -> expect one history entry with update
    useCanvasStore.getState().groupNodes('p', ['c']);
    let s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(3); // add p, add c, group
    expect(s.nodes['c']?.parentId).toBe('p');

    // undo -> parentId cleared
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['c']?.parentId ?? null).toBeNull();

    // redo -> parentId restored
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['c']?.parentId).toBe('p');

    // ungroup -> another history entry
    useCanvasStore.getState().ungroup(['c']);
    s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(4); // + ungroup
    expect(s.nodes['c']?.parentId).toBeNull();
  });
});

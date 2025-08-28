import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';
import type { CanvasStore } from './store';

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    visualGroups: {},
    selectedVisualGroupId: null,
    hoveredVisualGroupId: null,
    hoveredVisualGroupIdSecondary: null,
    centerAddIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
  } as Partial<CanvasStore>);
}

describe('Visual group deletion with undo/redo', () => {
  beforeEach(() => resetStore());

  const add = (n: Node) => useCanvasStore.getState().addNode(n);

  it('deleting a selected visual group removes the group and all its members', () => {
    // Nodes: group members g1,g2; unrelated u1
    add({ id: 'g1', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'g2', x: 20, y: 0, width: 10, height: 10 });
    add({ id: 'u1', x: 40, y: 0, width: 10, height: 10 });

    // Create visual group and select it
    useCanvasStore.setState((s) => ({
      ...s,
      visualGroups: { G: { id: 'G', members: ['g1', 'g2'] } },
      selectedVisualGroupId: 'G',
      selected: {},
    }));

    useCanvasStore.getState().deleteSelected();

    const s = useCanvasStore.getState();
    // Group removed
    expect(s.visualGroups['G']).toBeUndefined();
    // Members removed
    expect(s.nodes['g1']).toBeUndefined();
    expect(s.nodes['g2']).toBeUndefined();
    // Unrelated remains
    expect(s.nodes['u1']).toBeDefined();
    // Selection cleared
    expect(Object.keys(s.selected)).toHaveLength(0);
  });

  it('deleting a selected visual group also deletes additionally selected standalone nodes', () => {
    add({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'b', x: 20, y: 0, width: 10, height: 10 });
    add({ id: 'extra', x: 40, y: 0, width: 10, height: 10 });
    add({ id: 'keep', x: 60, y: 0, width: 10, height: 10 });

    useCanvasStore.setState((s) => ({
      ...s,
      visualGroups: { G: { id: 'G', members: ['a', 'b'] } },
      selectedVisualGroupId: 'G',
    }));
    // Additionally select a standalone node outside the group
    useCanvasStore.getState().selectOnly('extra');

    useCanvasStore.getState().deleteSelected();

    const s = useCanvasStore.getState();
    expect(s.visualGroups['G']).toBeUndefined();
    expect(s.nodes['a']).toBeUndefined();
    expect(s.nodes['b']).toBeUndefined();
    expect(s.nodes['extra']).toBeUndefined();
    expect(s.nodes['keep']).toBeDefined();
    expect(Object.keys(s.selected)).toHaveLength(0);
  });

  it('undo/redo restores removed visual group and nodes', () => {
    add({ id: 'n1', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'n2', x: 20, y: 0, width: 10, height: 10 });
    add({ id: 'other', x: 40, y: 0, width: 10, height: 10 });

    useCanvasStore.setState((s) => ({
      ...s,
      visualGroups: { G: { id: 'G', members: ['n1', 'n2'] } },
      selectedVisualGroupId: 'G',
    }));
    // Also select an extra node to be deleted together
    useCanvasStore.getState().selectOnly('other');

    const store = useCanvasStore.getState();
    store.deleteSelected();

    // After deletion
    let s = useCanvasStore.getState();
    expect(s.visualGroups['G']).toBeUndefined();
    expect(s.nodes['n1']).toBeUndefined();
    expect(s.nodes['n2']).toBeUndefined();
    expect(s.nodes['other']).toBeUndefined();

    // Undo should restore nodes and the visual group with the same id and members
    store.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['n1']).toBeDefined();
    expect(s.nodes['n2']).toBeDefined();
    expect(s.nodes['other']).toBeDefined();
    expect(s.visualGroups['G']).toBeDefined();
    const members = s.visualGroups['G']?.members ?? [];
    expect(new Set(members)).toEqual(new Set(['n1', 'n2']));

    // Redo should remove them again
    store.redo();
    s = useCanvasStore.getState();
    expect(s.visualGroups['G']).toBeUndefined();
    expect(s.nodes['n1']).toBeUndefined();
    expect(s.nodes['n2']).toBeUndefined();
    expect(s.nodes['other']).toBeUndefined();
  });
});

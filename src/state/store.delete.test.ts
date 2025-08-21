import { describe, expect, it, beforeEach } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';

function resetStore() {
  // Reset only state slices; keep action functions intact
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
  });
}

describe('bulk deletion in store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('removeNodes(ids) removes existing nodes and cleans selection', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'n1', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'n2', x: 1, y: 1, width: 10, height: 10 });
    add({ id: 'n3', x: 2, y: 2, width: 10, height: 10 });

    // select n1 and n3
    useCanvasStore.getState().selectOnly('n1');
    useCanvasStore.getState().addToSelection('n3');

    // remove n1 and n3; include a non-existing id to ensure idempotency
    useCanvasStore.getState().removeNodes(['n1', 'n3', 'nx']);

    const s = useCanvasStore.getState();
    expect(s.nodes['n1']).toBeUndefined();
    expect(s.nodes['n3']).toBeUndefined();
    expect(s.nodes['n2']).toBeDefined();

    // selection entries for removed ids must be gone
    expect(s.selected['n1']).toBeUndefined();
    expect(s.selected['n3']).toBeUndefined();

    // nothing else remains selected
    expect(Object.keys(s.selected)).toHaveLength(0);
  });

  it('deleteSelected() deletes only currently selected nodes and clears selection', () => {
    const add = (n: Node) => useCanvasStore.getState().addNode(n);
    add({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
    add({ id: 'b', x: 1, y: 1, width: 10, height: 10 });
    add({ id: 'c', x: 2, y: 2, width: 10, height: 10 });

    // select a and b, leave c unselected
    useCanvasStore.getState().selectOnly('a');
    useCanvasStore.getState().addToSelection('b');

    useCanvasStore.getState().deleteSelected();

    const s = useCanvasStore.getState();
    expect(s.nodes['a']).toBeUndefined();
    expect(s.nodes['b']).toBeUndefined();
    expect(s.nodes['c']).toBeDefined();

    // selection should be cleared
    expect(Object.keys(s.selected)).toHaveLength(0);
  });
});

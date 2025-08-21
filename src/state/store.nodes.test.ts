import { describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';

describe('nodes CRUD in store', () => {
  it('adds a node', () => {
    const node: Node = { id: 'a', x: 10, y: 20, width: 100, height: 50 };
    useCanvasStore.getState().addNode(node);
    const s = useCanvasStore.getState();
    expect(s.nodes['a']).toEqual(node);
  });

  it('updates a node by id with patch', () => {
    useCanvasStore.getState().addNode({ id: 'b', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().updateNode('b', { x: 5, y: 7 });
    const s = useCanvasStore.getState();
    expect(s.nodes['b']).toMatchObject({ x: 5, y: 7, width: 10, height: 10 });
  });

  it('removeNode deletes existing node and is idempotent', () => {
    useCanvasStore.getState().addNode({ id: 'c', x: 1, y: 2, width: 3, height: 4 });
    useCanvasStore.getState().removeNode('c');
    let s = useCanvasStore.getState();
    expect(s.nodes['c']).toBeUndefined();
    // second removal should not throw or change state
    useCanvasStore.getState().removeNode('c');
    s = useCanvasStore.getState();
    expect(s.nodes['c']).toBeUndefined();
  });
});

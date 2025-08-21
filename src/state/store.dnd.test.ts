import { describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';

describe('DnD in store: moveSelectedBy', () => {
  it('moves a single selected node by dx,dy (world units)', () => {
    const n: Node = { id: 'm1', x: 10, y: 20, width: 50, height: 40 };
    useCanvasStore.getState().addNode(n);
    useCanvasStore.getState().selectOnly('m1');

    useCanvasStore.getState().moveSelectedBy(15, -5);

    const s = useCanvasStore.getState();
    expect(s.nodes['m1']).toMatchObject({ x: 25, y: 15 });
  });

  it('moves multiple selected nodes together', () => {
    useCanvasStore.getState().addNode({ id: 'm2', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().addNode({ id: 'm3', x: 5, y: 5, width: 10, height: 10 });
    // select two nodes
    useCanvasStore.getState().selectOnly('m2');
    useCanvasStore.getState().addToSelection('m3');

    useCanvasStore.getState().moveSelectedBy(3, 4);

    const s = useCanvasStore.getState();
    expect(s.nodes['m2']).toMatchObject({ x: 3, y: 4 });
    expect(s.nodes['m3']).toMatchObject({ x: 8, y: 9 });
  });

  it('no-op when nothing selected or zero delta', () => {
    useCanvasStore.getState().addNode({ id: 'm4', x: 100, y: 200, width: 10, height: 10 });
    // nothing selected
    useCanvasStore.getState().moveSelectedBy(10, 10);
    let s = useCanvasStore.getState();
    expect(s.nodes['m4']).toMatchObject({ x: 100, y: 200 });

    // select and move by zero
    useCanvasStore.getState().selectOnly('m4');
    useCanvasStore.getState().moveSelectedBy(0, 0);
    s = useCanvasStore.getState();
    expect(s.nodes['m4']).toMatchObject({ x: 100, y: 200 });
  });
});

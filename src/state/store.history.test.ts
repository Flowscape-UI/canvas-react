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

describe('History: CRUD and undo/redo', () => {
  beforeEach(() => resetStore());

  it('records add/update/remove into history and supports undo/redo', () => {
    const a: Node = { id: 'h1', x: 10, y: 10, width: 20, height: 10 };
    useCanvasStore.getState().addNode(a);
    // update
    useCanvasStore.getState().updateNode('h1', { x: 15 });
    // remove
    useCanvasStore.getState().removeNode('h1');

    let s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(3);
    expect(s.nodes['h1']).toBeUndefined();

    // undo remove
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toBeDefined();
    expect(s.nodes['h1']).toMatchObject({ x: 15, y: 10 });

    // undo update
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toMatchObject({ x: 10, y: 10 });

    // undo add -> node gone
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toBeUndefined();

    // redo add
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toMatchObject({ x: 10, y: 10 });

    // redo update
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toMatchObject({ x: 15, y: 10 });

    // redo remove
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['h1']).toBeUndefined();
  });
});

describe('History: drag batching with beginHistory/endHistory', () => {
  beforeEach(() => resetStore());

  it('coalesces multiple moveSelectedBy calls into a single history entry with per-node updates', () => {
    const n1: Node = { id: 'hb1', x: 0, y: 0, width: 10, height: 10 };
    const n2: Node = { id: 'hb2', x: 5, y: 0, width: 10, height: 10 };
    useCanvasStore.getState().addNode(n1);
    useCanvasStore.getState().addNode(n2);
    useCanvasStore.getState().selectOnly('hb1');
    useCanvasStore.getState().addToSelection('hb2');

    // Start a batch (like NodeView drag)
    useCanvasStore.getState().beginHistory();
    useCanvasStore.getState().moveSelectedBy(1, 0);
    useCanvasStore.getState().moveSelectedBy(2, 0);
    useCanvasStore.getState().moveSelectedBy(-1, 0);
    useCanvasStore.getState().endHistory();

    let s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(3); // add n1, add n2, batch move
    // Final positions: total dx = 1+2-1 = 2
    expect(s.nodes['hb1']).toMatchObject({ x: 2, y: 0 });
    expect(s.nodes['hb2']).toMatchObject({ x: 7, y: 0 });

    // Undo should revert both nodes back to original positions in one step
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['hb1']).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes['hb2']).toMatchObject({ x: 5, y: 0 });

    // Redo should reapply the final positions
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['hb1']).toMatchObject({ x: 2, y: 0 });
    expect(s.nodes['hb2']).toMatchObject({ x: 7, y: 0 });
  });
});

describe('History: chaining and future clearing', () => {
  beforeEach(() => resetStore());

  it('clears future on new action after undo and keeps chaining correctly', () => {
    const a: Node = { id: 'hc1', x: 0, y: 0, width: 10, height: 10 };
    const b: Node = { id: 'hc2', x: 0, y: 0, width: 10, height: 10 };
    useCanvasStore.getState().addNode(a);
    useCanvasStore.getState().addNode(b);
    useCanvasStore.getState().updateNode('hc1', { x: 5 });

    let s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(3);

    // Undo last (update)
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['hc1']).toMatchObject({ x: 0, y: 0 });
    expect(s.historyFuture.length).toBe(1);

    // Perform a new action -> should clear future
    useCanvasStore.getState().updateNode('hc2', { y: 3 });
    s = useCanvasStore.getState();
    expect(s.historyFuture.length).toBe(0);

    // Undo twice -> should undo update hc2 and add b
    s.undo();
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['hc2']).toBeUndefined();

    // Redo twice -> re-add b and re-apply hc2 update
    s.redo();
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['hc2']).toMatchObject({ y: 3 });
  });
});

describe('History: camera pan and coalescing', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {},
      selected: {},
      centerAddIndex: 0,
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    } as Partial<CanvasStore>);
  });

  it('does not record single camera pan in history; undo/redo do not affect camera', () => {
    const s1 = useCanvasStore.getState();
    expect(s1.camera).toMatchObject({ offsetX: 0, offsetY: 0, zoom: 1 });
    useCanvasStore.getState().panBy(10, -5);
    let s2 = useCanvasStore.getState();
    expect(s2.camera).toMatchObject({ offsetX: 10, offsetY: -5 });
    expect(s2.historyPast.length).toBe(0);
    // undo should be a no-op for camera when there is no history
    s2.undo();
    s2 = useCanvasStore.getState();
    expect(s2.camera).toMatchObject({ offsetX: 10, offsetY: -5 });
    // redo -> still nothing
    s2.redo();
    s2 = useCanvasStore.getState();
    expect(s2.camera).toMatchObject({ offsetX: 10, offsetY: -5 });
  });

  it('panBy inside a batch is not recorded; empty batch is discarded', () => {
    useCanvasStore.getState().beginHistory('camera-pan');
    useCanvasStore.getState().panBy(5, 0);
    useCanvasStore.getState().panBy(5, 0);
    useCanvasStore.getState().panBy(-2, 3);
    useCanvasStore.getState().endHistory();
    let s = useCanvasStore.getState();
    // No node changes in the batch -> batch discarded
    expect(s.historyPast.length).toBe(0);
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: 3 });
    // undo still has nothing to do
    s.undo();
    s = useCanvasStore.getState();
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: 3 });
    // redo -> still nothing
    s.redo();
    s = useCanvasStore.getState();
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: 3 });
  });

  it('does not record an empty history batch', () => {
    useCanvasStore.getState().beginHistory('empty');
    useCanvasStore.getState().endHistory();
    const s = useCanvasStore.getState();
    expect(s.historyPast.length).toBe(0);
  });
});

describe('History: mixed batch (pan + moveSelectedBy)', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {},
      selected: {},
      centerAddIndex: 0,
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    } as Partial<CanvasStore>);
    // Provide a window shim to make visibility checks meaningful
    ((globalThis as unknown) as { window?: { innerWidth: number; innerHeight: number } }).window = {
      innerWidth: 800,
      innerHeight: 600,
    };
  });

  it('ignores camera moves in batch and keeps per-node updates; undo/redo restore only nodes', () => {
    // Arrange: two nodes selected
    useCanvasStore.getState().addNode({ id: 'mx1', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().addNode({ id: 'mx2', x: 5, y: 5, width: 10, height: 10 });
    useCanvasStore.getState().selectOnly('mx1');
    useCanvasStore.getState().addToSelection('mx2');

    // Batch: pan, move nodes, pan again
    useCanvasStore.getState().beginHistory('mixed');
    useCanvasStore.getState().panBy(10, -5);
    useCanvasStore.getState().moveSelectedBy(3, 4);
    useCanvasStore.getState().panBy(-2, 1);
    useCanvasStore.getState().endHistory();

    let s = useCanvasStore.getState();
    // Two adds + one batch
    expect(s.historyPast.length).toBe(3);
    // Camera: (10,-5)+(-2,1) = (8,-4)
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: -4 });
    // Nodes moved by (3,4)
    expect(s.nodes['mx1']).toMatchObject({ x: 3, y: 4 });
    expect(s.nodes['mx2']).toMatchObject({ x: 8, y: 9 });
    // Inside the batch: expect only node updates (no camera changes recorded)
    const last = s.historyPast[2];
    const kinds = last.changes.map((c) => c.kind);
    expect(kinds).toEqual(['update', 'update']);

    // Undo -> nodes back to initial, camera remains unchanged
    s.undo();
    s = useCanvasStore.getState();
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: -4 });
    expect(s.nodes['mx1']).toMatchObject({ x: 0, y: 0 });
    expect(s.nodes['mx2']).toMatchObject({ x: 5, y: 5 });

    // Redo -> nodes moved by (3,4) again, camera unchanged
    s.redo();
    s = useCanvasStore.getState();
    expect(s.camera).toMatchObject({ offsetX: 8, offsetY: -4 });
    expect(s.nodes['mx1']).toMatchObject({ x: 3, y: 4 });
    expect(s.nodes['mx2']).toMatchObject({ x: 8, y: 9 });
  });
});

describe('History: undo re-add centers camera when re-added nodes are off-screen', () => {
  beforeEach(() => resetStore());

  it('recenters viewport to re-added node bbox center on undo remove if currently off-screen', () => {
    // Provide a minimal window shim in Node env so undo() centering uses screen size
    ((globalThis as unknown) as { window?: { innerWidth: number; innerHeight: number } }).window = {
      innerWidth: 800,
      innerHeight: 600,
    };

    // Add a node near origin
    useCanvasStore.getState().addNode({ id: 'c1', x: 0, y: 0, width: 100, height: 60 });
    // Pan camera far away so the node is off-screen
    useCanvasStore.getState().panBy(5000, 5000);
    // Remove node and then undo -> should re-add and center camera
    useCanvasStore.getState().removeNode('c1');
    let s = useCanvasStore.getState();
    expect(s.nodes['c1']).toBeUndefined();
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['c1']).toBeDefined();
    // With zoom=1 and window 800x600, center of node (50,30) -> offset should be -350,-270
    expect(s.camera.offsetX).toBeCloseTo(-350, 6);
    expect(s.camera.offsetY).toBeCloseTo(-270, 6);
  });
});

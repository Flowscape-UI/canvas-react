import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';
import type { CanvasStore } from './store';
import type { Node } from '../types';

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    centerAddIndex: 0,
    clipboard: null,
    pasteIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
  } as Partial<CanvasStore>);
}

describe('Clipboard paste at position', () => {
  beforeEach(() => resetStore());

  it('pastes clipboard aligning bbox top-left to given world position', () => {
    const a: Node = { id: 'a', x: 20, y: 30, width: 50, height: 40 };
    const b: Node = { id: 'b', x: 60, y: 80, width: 30, height: 20, parentId: 'a' };
    useCanvasStore.getState().addNode(a);
    useCanvasStore.getState().addNode(b);

    useCanvasStore.getState().selectOnly('a');
    useCanvasStore.getState().copySelection();

    // Paste at world point (200, 100) -> dx = 200 - 20, dy = 100 - 30
    useCanvasStore.getState().pasteClipboard({ x: 200, y: 100 });

    const s = useCanvasStore.getState();
    const aCopy = s.nodes['a-copy'];
    const bCopy = s.nodes['b-copy'];
    expect(aCopy).toBeDefined();
    expect(bCopy).toBeDefined();
    expect(bCopy?.parentId).toBe('a-copy');
    expect(aCopy).toMatchObject({ x: 200, y: 100, width: 50, height: 40 });
    // Child must be shifted by same delta
    const dx = aCopy!.x - a.x;
    const dy = aCopy!.y - a.y;
    expect(bCopy).toMatchObject({ x: b.x + dx, y: b.y + dy, width: 30, height: 20 });

    // Selection equals pasted ids
    expect(s.selected).toEqual({ 'a-copy': true, 'b-copy': true });

    // Undo/redo integrity
    s.undo();
    expect(useCanvasStore.getState().nodes['a-copy']).toBeUndefined();
    s.redo();
    expect(useCanvasStore.getState().nodes['a-copy']).toBeDefined();
  });
});

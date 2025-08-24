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

describe('Clipboard actions: copy, cut, paste', () => {
  beforeEach(() => resetStore());

  it('copySelection copies selected and descendants into clipboard', () => {
    const p: Node = { id: 'p', x: 0, y: 0, width: 100, height: 60 };
    const c1: Node = { id: 'c1', x: 10, y: 5, width: 40, height: 20, parentId: 'p' };
    const c2: Node = { id: 'c2', x: 20, y: 15, width: 40, height: 20, parentId: 'c1' };
    useCanvasStore.getState().addNode(p);
    useCanvasStore.getState().addNode(c1);
    useCanvasStore.getState().addNode(c2);

    useCanvasStore.getState().selectOnly('p');
    useCanvasStore.getState().copySelection();

    const s = useCanvasStore.getState();
    expect(s.clipboard).toBeTruthy();
    const ids = new Set((s.clipboard?.nodes ?? []).map((n) => n.id));
    expect(ids.has('p')).toBe(true);
    expect(ids.has('c1')).toBe(true);
    expect(ids.has('c2')).toBe(true);
  });

  it('cutSelection copies then deletes selected nodes', () => {
    const a: Node = { id: 'a', x: 0, y: 0, width: 10, height: 10 };
    useCanvasStore.getState().addNode(a);
    useCanvasStore.getState().selectOnly('a');

    useCanvasStore.getState().cutSelection();

    const s = useCanvasStore.getState();
    expect(s.nodes['a']).toBeUndefined();
    expect(Object.keys(s.selected)).toHaveLength(0);
    expect(s.clipboard?.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('pasteClipboard remaps IDs, preserves parent links, offsets positions, selects pasted, and creates one history entry', () => {
    // Arrange a parent+child chain, select parent only
    const p: Node = { id: 'p', x: 0, y: 0, width: 100, height: 60 };
    const c1: Node = { id: 'c1', x: 10, y: 5, width: 40, height: 20, parentId: 'p' };
    useCanvasStore.getState().addNode(p);
    useCanvasStore.getState().addNode(c1);
    // Copy selection closure
    useCanvasStore.getState().selectOnly('p');
    useCanvasStore.getState().copySelection();

    // Paste once
    const sBefore = useCanvasStore.getState();
    expect(sBefore.pasteIndex).toBe(0);
    sBefore.pasteClipboard();

    let s = useCanvasStore.getState();
    expect(s.pasteIndex).toBe(1);
    // First paste uses k = 1 => offset (16,16)
    const pCopy = s.nodes['p-copy'];
    const c1Copy = s.nodes['c1-copy'];
    expect(pCopy).toBeDefined();
    expect(c1Copy).toBeDefined();
    expect(c1Copy?.parentId).toBe('p-copy');
    expect(pCopy).toMatchObject({ x: p.x + 16, y: p.y + 16, width: 100, height: 60 });
    expect(c1Copy).toMatchObject({ x: c1.x + 16, y: c1.y + 16, width: 40, height: 20 });
    // Selection should be exactly pasted IDs
    expect(s.selected).toEqual({ 'p-copy': true, 'c1-copy': true });

    // History: adds are batched into one entry
    expect(s.historyPast.length).toBe(3); // add p, add c1, paste batch
    const last = s.historyPast[s.historyPast.length - 1];
    expect(last.changes.every((c) => c.kind === 'add')).toBe(true);

    // Undo -> pasted nodes removed
    s.undo();
    s = useCanvasStore.getState();
    expect(s.nodes['p-copy']).toBeUndefined();
    expect(s.nodes['c1-copy']).toBeUndefined();

    // Redo -> re-added with same ids
    s.redo();
    s = useCanvasStore.getState();
    expect(s.nodes['p-copy']).toBeDefined();
    expect(s.nodes['c1-copy']).toBeDefined();

    // Paste again -> ids increment suffix, larger offset (k=2 => 32)
    s.pasteClipboard();
    s = useCanvasStore.getState();
    expect(s.nodes['p-copy2']).toBeDefined();
    expect(s.nodes['c1-copy2']).toBeDefined();
    expect(s.nodes['c1-copy2']?.parentId).toBe('p-copy2');
    expect(s.nodes['p-copy2']).toMatchObject({ x: p.x + 32, y: p.y + 32 });
  });
});

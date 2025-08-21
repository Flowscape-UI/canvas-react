import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './store';
import type { Node } from '../types';

describe('selection state (CORE-05a)', () => {
  beforeEach(() => {
    // reset store to initial state between tests
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {},
      selected: {},
    });
  });

  it('starts with empty selection', () => {
    const s = useCanvasStore.getState();
    expect(Object.keys(s.selected)).toHaveLength(0);
  });

  it('selectOnly selects exactly one id', () => {
    const a: Node = { id: 'a', x: 0, y: 0, width: 10, height: 10 };
    const b: Node = { id: 'b', x: 0, y: 0, width: 10, height: 10 };
    useCanvasStore.getState().addNode(a);
    useCanvasStore.getState().addNode(b);

    useCanvasStore.getState().selectOnly('a');
    let s = useCanvasStore.getState();
    expect(s.selected).toEqual({ a: true });

    useCanvasStore.getState().selectOnly('b');
    s = useCanvasStore.getState();
    expect(s.selected).toEqual({ b: true });
  });

  it('clearSelection empties selection', () => {
    useCanvasStore.getState().selectOnly('a');
    useCanvasStore.getState().clearSelection();
    const s = useCanvasStore.getState();
    expect(Object.keys(s.selected)).toHaveLength(0);
  });

  it('removeNode removes id from selection if present', () => {
    const a: Node = { id: 'a', x: 0, y: 0, width: 10, height: 10 };
    useCanvasStore.getState().addNode(a);
    useCanvasStore.getState().selectOnly('a');

    useCanvasStore.getState().removeNode('a');
    const s = useCanvasStore.getState();
    expect(s.nodes['a']).toBeUndefined();
    expect(s.selected['a']).toBeUndefined();
  });
});

describe('selection state (CORE-05b multi-select)', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {},
      selected: {},
    });
  });

  it('toggleInSelection toggles membership', () => {
    useCanvasStore.getState().toggleInSelection('a');
    let s = useCanvasStore.getState();
    expect(s.selected).toEqual({ a: true });

    useCanvasStore.getState().toggleInSelection('a');
    s = useCanvasStore.getState();
    expect(s.selected).toEqual({});
  });

  it('addToSelection and removeFromSelection modify set without duplicates', () => {
    useCanvasStore.getState().addToSelection('a');
    useCanvasStore.getState().addToSelection('a'); // idempotent
    useCanvasStore.getState().addToSelection('b');
    let s = useCanvasStore.getState();
    expect(s.selected).toEqual({ a: true, b: true });

    useCanvasStore.getState().removeFromSelection('a');
    s = useCanvasStore.getState();
    expect(s.selected).toEqual({ b: true });
  });

  it('selectOnly then addToSelection results in multi selection', () => {
    useCanvasStore.getState().selectOnly('a');
    useCanvasStore.getState().addToSelection('b');
    const s = useCanvasStore.getState();
    expect(s.selected).toEqual({ a: true, b: true });
  });
});

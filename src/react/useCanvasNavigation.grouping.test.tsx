/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';

function TestHost(props: { options?: Parameters<typeof useCanvasNavigation>[1] }) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, props.options);
  return <div data-testid="canvas" ref={ref} style={{ width: '800px', height: '600px' }} />;
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  await Promise.resolve();
  return { container, root, unmount: () => root.unmount() };
}

function dispatchKey(el: Element, key: string, code?: string, init?: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(ev);
}

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    visualGroups: {},
    selectedVisualGroupId: null,
    innerEditNodeId: null,
    centerAddIndex: 0,
    clipboard: null,
    pasteIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
    showRulers: true,
    guides: [],
    activeGuideId: null,
  } as Partial<CanvasStore>);
}

describe('useCanvasNavigation: grouping keyboard shortcut', () => {
  beforeEach(() => resetStore());

  it('Ctrl/Cmd+G creates a visual group from selection (>=2)', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Arrange two nodes and multi-select them
    await act(async () => {
      useCanvasStore.getState().addNode({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
      useCanvasStore.getState().addNode({ id: 'b', x: 20, y: 0, width: 10, height: 10 });
      useCanvasStore.getState().selectOnly('a');
      useCanvasStore.getState().addToSelection('b');
    });

    // Ctrl+G
    await act(async () => {
      dispatchKey(canvas, 'g', undefined, { ctrlKey: true });
    });
    let s = useCanvasStore.getState();
    let vgIds = Object.keys(s.visualGroups);
    expect(vgIds.length).toBe(1);
    let gid = vgIds[0];
    expect(s.selectedVisualGroupId).toBe(gid);
    expect(new Set(s.visualGroups[gid].members)).toEqual(new Set(['a', 'b']));

    // Meta+G variant
    await act(async () => {
      resetStore();
      useCanvasStore.getState().addNode({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
      useCanvasStore.getState().addNode({ id: 'b', x: 20, y: 0, width: 10, height: 10 });
      useCanvasStore.getState().selectOnly('a');
      useCanvasStore.getState().addToSelection('b');
      dispatchKey(canvas, 'g', undefined, { metaKey: true });
    });
    s = useCanvasStore.getState();
    vgIds = Object.keys(s.visualGroups);
    expect(vgIds.length).toBe(1);
    gid = vgIds[0];
    expect(s.selectedVisualGroupId).toBe(gid);
    expect(new Set(s.visualGroups[gid].members)).toEqual(new Set(['a', 'b']));

    await act(async () => {
      unmount();
    });
  });

  it('Ctrl/Cmd+G does nothing when selection size < 2', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    await act(async () => {
      useCanvasStore.getState().addNode({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
      useCanvasStore.getState().selectOnly('a');
    });

    // Ctrl+G
    await act(async () => {
      dispatchKey(canvas, 'g', undefined, { ctrlKey: true });
    });
    let s = useCanvasStore.getState();
    expect(Object.keys(s.visualGroups)).toHaveLength(0);
    expect(s.selectedVisualGroupId).toBeNull();

    // Meta+G
    await act(async () => {
      dispatchKey(canvas, 'g', undefined, { metaKey: true });
    });
    s = useCanvasStore.getState();
    expect(Object.keys(s.visualGroups)).toHaveLength(0);
    expect(s.selectedVisualGroupId).toBeNull();

    await act(async () => {
      unmount();
    });
  });
});

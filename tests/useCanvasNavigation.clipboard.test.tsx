/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasNavigation } from '../src/react/useCanvasNavigation';
import { useCanvasStore } from '../src/state/store';
import type { CanvasStore } from '../src/state/store';

function TestHost(props: {
  options?: Parameters<typeof useCanvasNavigation>[1];
  withInput?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, props.options);
  return (
    <div data-testid="canvas" ref={ref} style={{ width: '800px', height: '600px' }}>
      {props.withInput ? <input data-testid="inner-input" /> : null}
    </div>
  );
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
    centerAddIndex: 0,
    clipboard: null,
    pasteIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
  } as Partial<CanvasStore>);
}

describe('useCanvasNavigation: clipboard keyboard shortcuts', () => {
  beforeEach(() => resetStore());

  it('Ctrl/Cmd+C copies selected nodes into clipboard', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Arrange a node and selection
    useCanvasStore.getState().addNode({ id: 'a', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().selectOnly('a');

    // Ctrl+C
    dispatchKey(canvas, 'c', undefined, { ctrlKey: true });
    let s = useCanvasStore.getState();
    expect(s.clipboard?.nodes.map((n) => n.id)).toEqual(['a']);

    // Cmd+C (meta) also works
    useCanvasStore.getState().selectOnly('a');
    dispatchKey(canvas, 'c', undefined, { metaKey: true });
    s = useCanvasStore.getState();
    expect(s.clipboard?.nodes.map((n) => n.id)).toEqual(['a']);

    unmount();
  });

  it('Ctrl/Cmd+X cuts selected nodes (copies then deletes)', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().addNode({ id: 'b', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().selectOnly('b');

    dispatchKey(canvas, 'x', undefined, { ctrlKey: true });
    let s = useCanvasStore.getState();
    expect(s.clipboard?.nodes.map((n) => n.id)).toEqual(['b']);
    expect(s.nodes['b']).toBeUndefined();
    expect(Object.keys(s.selected)).toHaveLength(0);

    // Meta key variant
    useCanvasStore.getState().addNode({ id: 'b2', x: 0, y: 0, width: 10, height: 10 });
    useCanvasStore.getState().selectOnly('b2');
    dispatchKey(canvas, 'x', undefined, { metaKey: true });
    s = useCanvasStore.getState();
    expect(s.clipboard?.nodes.map((n) => n.id)).toEqual(['b2']);
    expect(s.nodes['b2']).toBeUndefined();

    unmount();
  });

  it('Ctrl/Cmd+V pastes clipboard with id remap and selects pasted nodes', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Seed clipboard by copying a parent+child
    useCanvasStore.getState().addNode({ id: 'p', x: 0, y: 0, width: 50, height: 30 });
    useCanvasStore
      .getState()
      .addNode({ id: 'c1', x: 5, y: 5, width: 20, height: 10, parentId: 'p' });
    useCanvasStore.getState().selectOnly('p');
    useCanvasStore.getState().copySelection();

    // Paste (Ctrl+V)
    dispatchKey(canvas, 'v', undefined, { ctrlKey: true });
    let s = useCanvasStore.getState();
    expect(s.nodes['p-copy']).toBeDefined();
    expect(s.nodes['c1-copy']).toBeDefined();
    expect(s.nodes['c1-copy']?.parentId).toBe('p-copy');
    expect(s.selected).toEqual({ 'p-copy': true, 'c1-copy': true });

    // Paste (Cmd+V)
    dispatchKey(canvas, 'v', undefined, { metaKey: true });
    s = useCanvasStore.getState();
    expect(s.nodes['p-copy2']).toBeDefined();
    expect(s.nodes['c1-copy2']).toBeDefined();
    expect(s.nodes['c1-copy2']?.parentId).toBe('p-copy2');

    unmount();
  });

  it('Ctrl/Cmd+V pastes at the current cursor world position', async () => {
    // Render and obtain the canvas element managed by the nav hook
    const { container, unmount } = await render(
      <TestHost options={{ wheelZoom: false, wheelBehavior: 'pan', doubleClickZoom: false }} />,
    );
    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Stub bounding rect so screen->world is deterministic
    const originalGetRect = canvas.getBoundingClientRect.bind(canvas);
    canvas.getBoundingClientRect = () =>
      ({
        left: 50,
        top: 60,
        width: 800,
        height: 600,
        right: 850,
        bottom: 660,
        x: 50,
        y: 60,
        toJSON() {},
      }) as DOMRect;

    // Seed clipboard with a parent+child; bbox min is at (0,0)
    useCanvasStore.getState().addNode({ id: 'p', x: 0, y: 0, width: 40, height: 30 });
    useCanvasStore
      .getState()
      .addNode({ id: 'c', x: 10, y: 5, width: 10, height: 10, parentId: 'p' });
    useCanvasStore.getState().selectOnly('p');
    useCanvasStore.getState().copySelection();

    // Simulate a wheel event to set last pointer position without changing camera
    const clientX = 350; // screen
    const clientY = 460; // screen
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      deltaX: 0,
      deltaY: 0,
    });
    canvas.dispatchEvent(wheel);

    // Now paste (Ctrl+V); expected world point = (client - rect) with zoom=1, offset=0 => (300,400)
    const worldX = clientX - 50;
    const worldY = clientY - 60;
    dispatchKey(canvas, 'v', undefined, { ctrlKey: true });

    const s = useCanvasStore.getState();
    const pCopy = s.nodes['p-copy'];
    const cCopy = s.nodes['c-copy'];
    expect(pCopy).toBeDefined();
    expect(cCopy).toBeDefined();
    expect(cCopy?.parentId).toBe('p-copy');
    expect(pCopy).toMatchObject({ x: worldX, y: worldY });
    expect(cCopy).toMatchObject({ x: 10 + worldX, y: 5 + worldY });

    // Restore
    canvas.getBoundingClientRect = originalGetRect;
    unmount();
  });
});

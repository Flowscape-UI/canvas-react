/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasNavigation } from './useCanvasNavigation';
import { Canvas } from './Canvas';
import { NodeView } from './NodeView';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';
import type { Node } from '../types';

// ---- PointerEvent polyfill (as used in other tests) ----

type PointerEventInitLike = MouseEventInit & {
  pointerId?: number;
  width?: number;
  height?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  pointerType?: string;
  isPrimary?: boolean;
};

interface GlobalWithPointer {
  PointerEvent?: typeof Event;
}

const g = globalThis as unknown as GlobalWithPointer;
if (typeof g.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public width: number;
    public height: number;
    public pressure: number;
    public tiltX: number;
    public tiltY: number;
    public pointerType: string;
    public isPrimary: boolean;
    constructor(type: string, params: PointerEventInitLike = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.width = params.width ?? 0;
      this.height = params.height ?? 0;
      this.pressure = params.pressure ?? 0.5;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof Event }).PointerEvent =
    PointerEventPolyfill as unknown as typeof Event;
}

// ---- Test scaffolding ----

function TestHost(props: { withNode?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, {
    panButton: 1,
    panModifier: 'none',
    wheelZoom: false,
    // Enable double-click zoom to verify it's ignored when dblclick originates from node
    doubleClickZoom: true,
  });

  return (
    <Canvas
      ref={ref}
      style={{ width: 800, height: 600, border: '1px solid #ddd', position: 'relative' }}
      tabIndex={0}
    >
      {props.withNode ? (
        <NodeView node={useCanvasStore.getState().nodes['n1']!} />
      ) : null}
    </Canvas>
  );
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // Allow effects to mount
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    ...init,
  });
  target.dispatchEvent(ev);
}

function dispatchDblClick(target: EventTarget, init?: MouseEventInit) {
  const ev = new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(ev);
}

function dispatchKey(el: Element, key: string, code?: string, init?: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
}

function stubRect(el: HTMLElement, rect: Partial<DOMRect> = {}) {
  const base: DOMRect = {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect;
  const value = { ...base, ...rect } as DOMRect;
  const original = el.getBoundingClientRect.bind(el);
  el.getBoundingClientRect = () => value;
  return () => {
    el.getBoundingClientRect = original;
  };
}

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    centerAddIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
    innerEditNodeId: null,
  } as Partial<CanvasStore>);
}

beforeEach(() => {
  resetStore();
});

describe('Inner-edit interactions', () => {
  it('double-clicking a node enters inner-edit and does not trigger canvas zoom', async () => {
    // Arrange: one node on canvas
    useCanvasStore.setState((s) => ({
      ...s,
      nodes: { n1: { id: 'n1', x: 100, y: 100, width: 120, height: 60 } as Node },
    }));

    const { container, unmount } = await render(<TestHost withNode />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const nodeEl = (container.querySelector('[data-rc-nodeid="n1"]') ||
      document.querySelector('[data-rc-nodeid="n1"]')) as HTMLElement;
    expect(canvas).toBeTruthy();
    expect(nodeEl).toBeTruthy();

    // Stub rect to make zoom center computations safe if ever called
    const restoreRect = stubRect(canvas);

    // Act: double-click the node
    dispatchDblClick(nodeEl);

    // Assert: inner-edit entered and camera zoom unchanged
    const s = useCanvasStore.getState();
    expect(s.innerEditNodeId).toBe('n1');
    expect(s.camera.zoom).toBe(1);

    restoreRect();
    await unmount();
  });

  it('pressing Escape exits inner-edit mode', async () => {
    // Arrange: active inner-edit
    useCanvasStore.setState((s) => ({ ...s, innerEditNodeId: 'n1' }));

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;

    // Act: press Escape on canvas
    dispatchKey(canvas, 'Escape', 'Escape');

    // Assert: inner-edit cleared
    expect(useCanvasStore.getState().innerEditNodeId).toBeNull();

    await unmount();
  });

  it('true click on empty canvas exits inner-edit mode', async () => {
    // Arrange: activate inner-edit and selection (selection not strictly required)
    useCanvasStore.setState((s) => ({
      ...s,
      innerEditNodeId: 'n1',
      nodes: { n1: { id: 'n1', x: 0, y: 0, width: 50, height: 30 } as Node },
    }));

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;

    // Ensure deterministic geometry
    const restoreRect = stubRect(canvas);

    // Act: simple click (no drag)
    dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 400, clientY: 300 });
    dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 400, clientY: 300 });

    // Assert: inner-edit cleared
    expect(useCanvasStore.getState().innerEditNodeId).toBeNull();

    restoreRect();
    await unmount();
  });
});

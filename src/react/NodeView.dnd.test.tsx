/* @vitest-environment jsdom */

import React, { useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { NodeView } from './NodeView';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';
import type { Node } from '../types';

// Polyfill PointerEvent in jsdom if missing
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

function TestHost() {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, {
    panButton: 1,
    panModifier: 'none',
    wheelZoom: false,
    doubleClickZoom: false,
  });
  const node = useCanvasStore.getState().nodes['d1'];
  if (!node) return <div data-rc-canvas ref={ref} style={{ width: 800, height: 600 }} />;

  return (
    <div data-rc-canvas ref={ref} style={{ width: 800, height: 600 }}>
      <NodeView node={node} />
    </div>
  );
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  root.render(ui);
  // wait microtask + macrotask to allow effects to mount
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return { container, root, unmount: () => root.unmount() };
}

function dispatchPointer(el: Element, type: string, init: PointerEventInit) {
  const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
  el.dispatchEvent(ev);
}

describe('NodeView DnD UI + hit-testing vs canvas pan', () => {
  beforeEach(() => {
    // reset store
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: { d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node },
      selected: { d1: true },
      centerAddIndex: 0,
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    } as Partial<CanvasStore>);
  });

  it("dragging a node moves it and doesn't pan the canvas; one history batch is recorded", async () => {
    const { container, unmount } = await render(<TestHost />);
    let nodeEl = container.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    if (!nodeEl) nodeEl = document.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    expect(nodeEl).toBeTruthy();

    // Start drag on the node
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    // move beyond threshold (DRAG_THRESHOLD_PX = 3)
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 312, clientY: 209 }); // dx=12, dy=9 (screen)
    // finish
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 312, clientY: 209 });

    const s = useCanvasStore.getState();
    // Camera should not have panned because useCanvasNavigation ignores node-origin events
    expect(s.camera.offsetX).toBe(0);
    expect(s.camera.offsetY).toBe(0);

    // Node should have moved by world delta = screen delta / zoom (zoom=1)
    expect(s.nodes['d1']).toMatchObject({ x: 112, y: 109 });

    // History: exactly one batch for the drag (we prepopulated the node directly)
    expect(s.historyPast.length).toBe(1);
    const last = s.historyPast[0];
    // Only updates inside the batch
    expect(last.changes.every((c) => c.kind === 'update')).toBe(true);

    unmount();
  });

  it('dropping a node inside a group container does NOT auto-group; only movement is recorded in one batch', async () => {
    // Setup: Group root G with descendant g1 -> container exists; draggable d1 is selected
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {
        d1: { id: 'd1', x: 20, y: 20, width: 40, height: 20 } as Node,
        G: { id: 'G', x: 200, y: 100, width: 100, height: 60 } as Node,
        g1: { id: 'g1', x: 340, y: 120, width: 40, height: 30, parentId: 'G' } as Node,
      },
      selected: { d1: true },
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    }));

    const { container, unmount } = await render(<TestHost />);
    let nodeEl = container.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    if (!nodeEl) nodeEl = document.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    expect(nodeEl).toBeTruthy();

    // Start drag on d1 and drop inside G's container (which spans roughly [192..388]x[92..168])
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 30, clientY: 30 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 45, clientY: 45 }); // exceed threshold
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 210, clientY: 110 }); // inside G container

    const s = useCanvasStore.getState();
    // Node d1 should NOT have been auto-adopted into G (grouping now only via Ctrl/Cmd+G)
    expect(s.nodes['d1'].parentId).toBeUndefined();
    // Batch count: one history entry for the drag movement only
    expect(s.historyPast.length).toBe(1);

    unmount();
  });
});

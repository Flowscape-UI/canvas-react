/* @vitest-environment jsdom */

import React, { useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { NodeView } from '../src/react/NodeView';
import { useCanvasNavigation } from '../src/react/useCanvasNavigation';
import { useCanvasStore } from '../src/state/store';
import type { CanvasStore } from '../src/state/store';
import type { Node } from '../src/types';
import { AlignGuidesOverlay } from '../src/react/AlignGuidesOverlay';

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
      {/* Render alignment guides overlay for DOM assertions */}
      <AlignGuidesOverlay />
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

async function waitTick() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
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

  it('shows alignment guides during drag near another node and clears on drop', async () => {
    // Setup: two nodes horizontally aligned by center when d1 is moved by ~200px
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      alignSnapEnabled: true,
      alignSnapTolerancePx: 8,
      nodes: {
        d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node,
        d2: { id: 'd2', x: 300, y: 100, width: 80, height: 40 } as Node,
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

    // Start drag and move slightly to cross threshold
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 50, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 60, clientY: 50 });
    // Now move close to perfect center alignment with d2 (dx ≈ 200)
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 260, clientY: 50 });
    await waitTick();

    // Alignment guides should be present during drag
    let guidesEl =
      (container.querySelector('[data-rc-align-guides]') as HTMLElement | null) ||
      (document.querySelector('[data-rc-align-guides]') as HTMLElement | null);
    expect(guidesEl).toBeTruthy();

    // Finish drag -> ephemeral guides cleared
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 260, clientY: 50 });
    await waitTick();
    guidesEl =
      (container.querySelector('[data-rc-align-guides]') as HTMLElement | null) ||
      (document.querySelector('[data-rc-align-guides]') as HTMLElement | null);
    expect(guidesEl).toBeNull();

    unmount();
  });

  it('sets snapOffset during drag when guides show and clears it on drop', async () => {
    // Setup: two nodes horizontally aligned by center when d1 is moved by ~200px; same Y ensures a Y guide
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      alignSnapEnabled: true,
      alignSnapTolerancePx: 8,
      nodes: {
        d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node,
        d2: { id: 'd2', x: 300, y: 100, width: 80, height: 40 } as Node,
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

    // Start drag and move slightly to cross threshold, then move near center alignment
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 50, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 60, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 260, clientY: 50 });
    await waitTick();

    // During drag, snapOffset should be non-null when guides are present (even if correction is 0)
    const during = useCanvasStore.getState();
    expect(during.alignmentGuides.length).toBeGreaterThan(0);
    expect(during.snapOffset).not.toBeNull();

    // Finish drag -> snapOffset cleared
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 260, clientY: 50 });
    await waitTick();
    const after = useCanvasStore.getState();
    expect(after.snapOffset).toBeNull();

    unmount();
  });

  it('does not show guides or snapOffset when snapping is disabled', async () => {
    // Setup similar to previous test but with snapping disabled
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      alignSnapEnabled: false,
      alignSnapTolerancePx: 8,
      nodes: {
        d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node,
        d2: { id: 'd2', x: 300, y: 100, width: 80, height: 40 } as Node,
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

    // Start drag and move in alignment proximity
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 50, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 60, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 260, clientY: 50 });
    await waitTick();

    // No guides element should be mounted
    const guidesEl =
      (container.querySelector('[data-rc-align-guides]') as HTMLElement | null) ||
      (document.querySelector('[data-rc-align-guides]') as HTMLElement | null);
    expect(guidesEl).toBeNull();
    // And snapOffset should remain null
    expect(useCanvasStore.getState().snapOffset).toBeNull();

    // Finish drag
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 260, clientY: 50 });
    unmount();
  });

  it('clears alignment guides when a drag is canceled (pointercancel)', async () => {
    // Setup similar to previous test
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      alignSnapEnabled: true,
      alignSnapTolerancePx: 8,
      nodes: {
        d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node,
        d2: { id: 'd2', x: 300, y: 100, width: 80, height: 40 } as Node,
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

    // Start drag and move slightly to cross threshold
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 50, clientY: 50 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 60, clientY: 50 });
    // Move near alignment to show guides
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 260, clientY: 50 });
    await waitTick();

    // Guides should be visible now
    let guidesEl =
      (container.querySelector('[data-rc-align-guides]') as HTMLElement | null) ||
      (document.querySelector('[data-rc-align-guides]') as HTMLElement | null);
    expect(guidesEl).toBeTruthy();

    // Before cancel: snapOffset should be present while guides are shown
    expect(useCanvasStore.getState().snapOffset).not.toBeNull();
    // Cancel the drag
    dispatchPointer(nodeEl!, 'pointercancel', { clientX: 260, clientY: 50 });
    await waitTick();
    guidesEl =
      (container.querySelector('[data-rc-align-guides]') as HTMLElement | null) ||
      (document.querySelector('[data-rc-align-guides]') as HTMLElement | null);
    expect(guidesEl).toBeNull();
    // snapOffset should also be cleared
    expect(useCanvasStore.getState().snapOffset).toBeNull();

    unmount();
  });

  it('coalesces multiple moves in one drag into a single update history entry; undo/redo restore positions', async () => {
    // Setup
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: { d1: { id: 'd1', x: 100, y: 100, width: 80, height: 40 } as Node },
      selected: { d1: true },
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    }));

    const { container, unmount } = await render(<TestHost />);
    let nodeEl = container.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    if (!nodeEl) nodeEl = document.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    expect(nodeEl).toBeTruthy();

    // Start drag
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 300, clientY: 200 });
    // Move in several increments
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 308, clientY: 200 }); // dx=8, dy=0
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 320, clientY: 212 }); // dx=12, dy=12
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 332, clientY: 212 }); // dx=12, dy=0
    // Drop
    dispatchPointer(nodeEl!, 'pointerup', { button: 0, clientX: 332, clientY: 212 });

    const s = useCanvasStore.getState();
    // Final position should reflect total delta: (100+32, 100+12)
    expect(s.nodes['d1']).toMatchObject({ x: 132, y: 112 });
    // Exactly one history entry, with exactly one coalesced update for d1
    expect(s.historyPast.length).toBe(1);
    const entry = s.historyPast[0];
    expect(entry.changes.length).toBe(1);
    const ch = entry.changes[0];
    expect(ch.kind).toBe('update');
    if (ch.kind !== 'update') throw new Error('Expected update change');
    expect(ch.before).toMatchObject({ id: 'd1', x: 100, y: 100 });
    expect(ch.after).toMatchObject({ id: 'd1', x: 132, y: 112 });

    // Undo returns to initial position
    useCanvasStore.getState().undo();
    const sAfterUndo = useCanvasStore.getState();
    expect(sAfterUndo.nodes['d1']).toMatchObject({ x: 100, y: 100 });
    // Redo returns to final
    useCanvasStore.getState().redo();
    const sAfterRedo = useCanvasStore.getState();
    expect(sAfterRedo.nodes['d1']).toMatchObject({ x: 132, y: 112 });

    unmount();
  });

  it('pointercancel ends the drag and commits a single history entry with last position', async () => {
    // Setup
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: { d1: { id: 'd1', x: 10, y: 20, width: 80, height: 40 } as Node },
      selected: { d1: true },
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    }));

    const { container, unmount } = await render(<TestHost />);
    let nodeEl = container.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    if (!nodeEl) nodeEl = document.querySelector('[data-rc-nodeid="d1"]') as HTMLElement | null;
    expect(nodeEl).toBeTruthy();

    // Drag and then cancel
    dispatchPointer(nodeEl!, 'pointerdown', { button: 0, clientX: 50, clientY: 60 });
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 60, clientY: 70 }); // cross threshold
    dispatchPointer(nodeEl!, 'pointermove', { clientX: 85, clientY: 95 }); // more movement
    dispatchPointer(nodeEl!, 'pointercancel', { clientX: 85, clientY: 95 });

    const s2 = useCanvasStore.getState();
    // Position should reflect last movement: total dx=35, dy=35 from start -> (45,55)
    expect(s2.nodes['d1']).toMatchObject({ x: 45, y: 55 });
    // One history entry committed on cancel
    expect(s2.historyPast.length).toBe(1);
    const e2 = s2.historyPast[0];
    expect(e2.changes.length).toBe(1);
    expect(e2.changes[0].kind).toBe('update');

    // Undo returns to initial
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes['d1']).toMatchObject({ x: 10, y: 20 });

    unmount();
  });
});

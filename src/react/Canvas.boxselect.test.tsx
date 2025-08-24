/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { Canvas } from './Canvas';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';
import type { Node } from '../types';

// ---- PointerEvent polyfill (copied/adapted from NodeView.dnd.test.tsx) ----
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

// ---- Test utilities ----

function TestHost() {
  const ref = useRef<HTMLDivElement>(null);
  // Enable middle-button panning, disable zoom shortcuts to avoid noise
  useCanvasNavigation(ref, {
    panButton: 1,
    panModifier: 'none',
    wheelZoom: false,
    doubleClickZoom: false,
  });
  return (
    <Canvas
      ref={ref}
      style={{ width: 800, height: 600, border: '1px solid #ddd', position: 'relative' }}
      tabIndex={0}
    />
  );
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // wait microtask + macrotask to allow effects to mount
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
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

function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...init,
  });
  target.dispatchEvent(ev);
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
  } as Partial<CanvasStore>);
}

beforeEach(() => {
  resetStore();
});

describe('Canvas: rectangle selection and panning interactions', () => {
  it('left-drag on empty canvas starts box selection without Shift, overlays and live-highlights', async () => {
    // Arrange: create a few nodes in world space
    useCanvasStore.setState({
      nodes: {
        a: { id: 'a', x: 50, y: 40, width: 100, height: 60 } as Node,
        b: { id: 'b', x: 250, y: 40, width: 100, height: 60 } as Node,
        c: { id: 'c', x: 450, y: 40, width: 100, height: 60 } as Node,
      },
    });

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    expect(canvas).toBeTruthy();
    const restoreRect = stubRect(canvas);

    // Act: start drag; then allow a re-render; then move again for live-highlighting
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(canvas, 'pointermove', { clientX: 12, clientY: 12 }); // below threshold, no box yet
      dispatchPointer(canvas, 'pointermove', { clientX: 200, clientY: 200 }); // starts box-select
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await act(async () => {
      // Now the component has re-rendered with isBoxSelecting=true
      dispatchPointer(canvas, 'pointermove', { clientX: 210, clientY: 210 });
    });

    // Assert: overlay exists and has expected geometry
    const overlay = document.querySelector('[data-rc-box]') as HTMLDivElement | null;
    expect(overlay).toBeTruthy();
    const style = overlay!.style;
    expect(style.left).toBe('10px');
    expect(style.top).toBe('10px');
    expect(style.width).toBe('200px');
    expect(style.height).toBe('200px');

    // Live selection highlights nodes under the current rect: only 'a' is inside
    const sel = useCanvasStore.getState().selected;
    expect(Object.keys(sel).sort()).toEqual(['a']);

    // Finish drag
    await act(async () => {
      dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 210, clientY: 210 });
    });

    restoreRect();
    await unmount();
  });

  it('auto-pans while box-select cursor is near the right/bottom edge', async () => {
    // Arrange: enable middle-button pan in nav; box-select uses left button here
    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas, {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });

    // Mock rAF so we can drive auto-pan frames manually
    const gAny = globalThis as unknown as {
      requestAnimationFrame: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame: (id: number) => void;
    };
    const origRAF = gAny.requestAnimationFrame;
    const origCAF = gAny.cancelAnimationFrame;
    const queue: FrameRequestCallback[] = [];
    gAny.requestAnimationFrame = (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    };
    gAny.cancelAnimationFrame = (id: number) => {
      // no-op in tests; consume id to avoid unused-var lint
      void id;
    };
    const flushFrames = (n: number) => {
      for (let i = 0; i < n; i++) {
        const cb = queue.shift();
        if (cb) cb(performance.now());
      }
    };

    try {
      // Ensure camera at origin
      useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

      // Start left drag to activate box-select
      await act(async () => {
        dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
        dispatchPointer(canvas, 'pointermove', { clientX: 160, clientY: 140 });
      });
      // Move cursor into the right-bottom edge zone to trigger auto-pan
      await act(async () => {
        dispatchPointer(canvas, 'pointermove', { clientX: 795, clientY: 595 });
      });

      // Drive a few rAF frames; camera should pan positively (right and down in world space)
      flushFrames(5);
      let cam = useCanvasStore.getState().camera;
      expect(cam.offsetX).toBeGreaterThan(0);
      expect(cam.offsetY).toBeGreaterThan(0);

      // Release pointer — auto-pan must stop
      await act(async () => {
        dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 795, clientY: 595 });
      });
      const stopX = useCanvasStore.getState().camera.offsetX;
      const stopY = useCanvasStore.getState().camera.offsetY;
      // Even if a queued callback runs once, it should early-return and not change camera
      flushFrames(3);
      cam = useCanvasStore.getState().camera;
      expect(cam.offsetX).toBe(stopX);
      expect(cam.offsetY).toBe(stopY);

      restoreRect();
      await unmount();
    } finally {
      // restore rAF
      gAny.requestAnimationFrame = origRAF;
      gAny.cancelAnimationFrame = origCAF;
    }
  });

  it('additive selection with Ctrl merges initial snapshot on pointerup', async () => {
    // Arrange: two nodes and a pre-selection of b
    useCanvasStore.setState({
      nodes: {
        a: { id: 'a', x: 50, y: 40, width: 100, height: 60 } as Node,
        b: { id: 'b', x: 250, y: 40, width: 100, height: 60 } as Node,
      },
      selected: { b: true },
    });

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas);

    // Drag a rectangle around node 'a'
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(canvas, 'pointermove', { clientX: 160, clientY: 120 });
    });
    // On pointerup hold Ctrl to request additive merge
    await act(async () => {
      dispatchPointer(canvas, 'pointerup', {
        button: 0,
        clientX: 160,
        clientY: 120,
        ctrlKey: true,
      });
    });

    const sel = useCanvasStore.getState().selected;
    expect(new Set(Object.keys(sel))).toEqual(new Set(['a', 'b']));

    restoreRect();
    await unmount();
  });

  it('click without drag on empty canvas clears selection', async () => {
    // Preselect one node
    useCanvasStore.setState({
      nodes: { a: { id: 'a', x: 50, y: 40, width: 100, height: 60 } as Node },
      selected: { a: true },
    });

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas);

    // Simple click (no movement beyond threshold)
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 400, clientY: 400 });
      dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 400, clientY: 400 });
    });

    const sel = useCanvasStore.getState().selected;
    expect(Object.keys(sel).length).toBe(0);

    restoreRect();
    await unmount();
  });

  it('left-drag does not pan the camera, while middle-drag pans', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas);

    // Ensure camera at origin
    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Left drag to start box selection (should not pan)
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
      dispatchPointer(canvas, 'pointermove', { clientX: 140, clientY: 130 });
      dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 140, clientY: 130 });
    });

    let cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(0);
    expect(cam.offsetY).toBe(0);

    // Middle drag should pan (useCanvasNavigation listens on window for move/up)
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 1, clientX: 300, clientY: 300 });
      dispatchPointer(window, 'pointermove', { clientX: 320, clientY: 330 }); // dx=20, dy=30 => panBy(-20,-30)
      dispatchPointer(window, 'pointerup', { button: 1, clientX: 320, clientY: 330 });
    });

    cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(-20);
    expect(cam.offsetY).toBe(-30);

    restoreRect();
    await unmount();
  });

  it('selection works with non-default camera (zoom and offset)', async () => {
    // Camera zoom=2, offset=(100,50)
    useCanvasStore.getState().setCamera({ zoom: 2, offsetX: 100, offsetY: 50 });
    // Node at world (120,70) size (40x20) -> screen bbox: x [40..120], y [40..80]
    useCanvasStore.setState({
      nodes: { k: { id: 'k', x: 120, y: 70, width: 40, height: 20 } as Node },
    });

    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas);

    // Drag a rect that includes the node's screen bbox
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
      dispatchPointer(canvas, 'pointermove', { clientX: 90, clientY: 90 }); // starts selection
    });
    // Extra move to ensure isBoxSelecting branch ran before pointerup
    await act(async () => {
      dispatchPointer(canvas, 'pointermove', { clientX: 95, clientY: 95 });
      dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 95, clientY: 95 });
    });

    const sel = useCanvasStore.getState().selected;
    expect(Object.keys(sel)).toEqual(['k']);

    restoreRect();
    await unmount();
  });

  it('overlay rectangle grows during auto-pan and keeps the cursor-side anchored', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement;
    const restoreRect = stubRect(canvas, {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });

    // Mock rAF to drive auto-pan frames deterministically
    const gAny = globalThis as unknown as {
      requestAnimationFrame: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame: (id: number) => void;
    };
    const origRAF = gAny.requestAnimationFrame;
    const origCAF = gAny.cancelAnimationFrame;
    const queue: FrameRequestCallback[] = [];
    gAny.requestAnimationFrame = (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    };
    gAny.cancelAnimationFrame = (id: number) => {
      void id;
    };
    const flushFrames = (n: number) => {
      for (let i = 0; i < n; i++) {
        const cb = queue.shift();
        if (cb) cb(performance.now());
      }
    };

    try {
      // Start box selection
      await act(async () => {
        dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
        dispatchPointer(canvas, 'pointermove', { clientX: 160, clientY: 140 });
      });

      // Move near the right/bottom edge to trigger auto-pan
      await act(async () => {
        dispatchPointer(canvas, 'pointermove', { clientX: 795, clientY: 595 });
      });

      // Capture initial overlay geometry
      let overlay = document.querySelector('[data-rc-box]') as HTMLDivElement | null;
      expect(overlay).toBeTruthy();
      const width0 = parseInt(overlay!.style.width || '0', 10);
      const cursorX = 795; // right edge cursor x

      // Drive a few frames of auto-pan and verify that width increases
      await act(async () => {
        flushFrames(8);
      });
      // allow effects/state to commit
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      overlay = document.querySelector('[data-rc-box]') as HTMLDivElement | null;
      expect(overlay).toBeTruthy();
      const left1 = parseInt(overlay!.style.left || '0', 10);
      const width1 = parseInt(overlay!.style.width || '0', 10);

      expect(width1).toBeGreaterThan(width0);
      // The right edge should remain near the cursor X (allowing small rounding diff)
      expect(Math.abs(left1 + width1 - cursorX)).toBeLessThanOrEqual(2);

      // Release pointer to stop auto-pan
      await act(async () => {
        dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 795, clientY: 595 });
      });

      restoreRect();
      await unmount();
    } finally {
      gAny.requestAnimationFrame = origRAF;
      gAny.cancelAnimationFrame = origCAF;
    }
  });
});

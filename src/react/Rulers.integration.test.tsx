/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { Canvas } from './Canvas';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';

// ---- PointerEvent polyfill (same as in Canvas.boxselect.test.tsx) ----
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

// ---- Test utilities (mirrored from Canvas.boxselect.test.tsx) ----
function TestHost() {
  const ref = useRef<HTMLDivElement>(null);
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

function getCanvas(container: HTMLElement) {
  return (
    (container.querySelector('[data-rc-canvas]') ||
      document.querySelector('[data-rc-canvas]')) as HTMLDivElement
  );
}

function getRulersRoot() {
  return document.querySelector('[data-rc-rulers]') as HTMLDivElement | null;
}

function queryGuides(): HTMLDivElement[] {
  return Array.from(
    document.querySelectorAll('[data-rc-guide]') as NodeListOf<HTMLDivElement>,
  );
}

function setGlobalClientSize(size: { width: number; height: number }) {
  const descW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const descH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => size.width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => size.height,
  });
  return () => {
    if (descW) Object.defineProperty(HTMLElement.prototype, 'clientWidth', descW);
    if (descH) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descH);
  };
}

// Per-element client size stub. Useful when we want to constrain only rulersRoot dimensions.
function stubClientSize(el: HTMLElement, size: { width: number; height: number }) {
  const prevW = Object.getOwnPropertyDescriptor(el, 'clientWidth');
  const prevH = Object.getOwnPropertyDescriptor(el, 'clientHeight');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => size.width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => size.height });
  return () => {
    if (prevW) Object.defineProperty(el, 'clientWidth', prevW);
    else delete (el as unknown as { clientWidth?: unknown }).clientWidth;
    if (prevH) Object.defineProperty(el, 'clientHeight', prevH);
    else delete (el as unknown as { clientHeight?: unknown }).clientHeight;
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
    guides: [],
    activeGuideId: null,
  } as Partial<CanvasStore>);
}

beforeEach(() => {
  resetStore();
});

describe('Rulers: guides interactions', () => {
  it('creates a horizontal guide by dragging from the top ruler', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    expect(canvas).toBeTruthy();
    expect(rulersRoot).toBeTruthy();

    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);

    const top = document.querySelector('[data-rc-ruler-top]') as HTMLDivElement;
    expect(top).toBeTruthy();

    // Start drag on the top ruler and move inside content to y=100 to create a horizontal (axis y) guide
    await act(async () => {
      dispatchPointer(top, 'pointerdown', { button: 0, clientX: 50, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 200, clientY: 100 });
    });
    // allow React to commit
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const guides = queryGuides();
    expect(guides.length).toBe(1);
    const gEl = guides[0];
    expect(gEl.getAttribute('data-rc-guide-axis')).toBe('y');

    // The guide value is in world coordinates, with zoom=1 and offset=0 equals screen y
    const st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    const g = st.guides[0];
    expect(g.axis).toBe('y');
    expect(g.value).toBeCloseTo(100, 3);

    // Finish drag
    await act(async () => {
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 200, clientY: 100 });
    });

    restoreRulersRect();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });

  it('creates a vertical guide by dragging from the left ruler', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    expect(canvas).toBeTruthy();
    expect(rulersRoot).toBeTruthy();

    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);
    const restoreClient = stubClientSize(rulersRoot!, { width: 800, height: 600 });

    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    expect(left).toBeTruthy();

    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 50 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 150, clientY: 200 });
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const guides = queryGuides();
    expect(guides.length).toBe(1);
    const gEl = guides[0];
    expect(gEl.getAttribute('data-rc-guide-axis')).toBe('x');

    const st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    const g = st.guides[0];
    expect(g.axis).toBe('x');
    expect(g.value).toBeCloseTo(150, 3);

    await act(async () => {
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 150, clientY: 200 });
    });

    restoreRulersRect();
    restoreClient();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });

  it('moves a guide with temporary updates and commits on pointerup', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);
    const restoreClient = stubClientSize(rulersRoot!, { width: 800, height: 600 });

    // Create a vertical guide at x=150
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 150, clientY: 120 });
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    let st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    const id = st.guides[0].id;

    // Start moving: pointerdown on guide, then move to x=300 (temporary update)
    const guideEl = document.querySelector(
      '[data-rc-guide][data-rc-guide-axis="x"]',
    ) as HTMLDivElement;
    expect(guideEl).toBeTruthy();

    await act(async () => {
      dispatchPointer(guideEl, 'pointerdown', { button: 0, clientX: 150, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 300, clientY: 120 });
    });

    st = useCanvasStore.getState();
    const temp = st.guides.find((g) => g.id === id)!;
    expect(temp.value).toBeCloseTo(300, 3);

    // Commit on pointerup
    await act(async () => {
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 300, clientY: 120 });
    });

    // History should now have 2 entries (add + move), and final value is 300
    st = useCanvasStore.getState();
    expect(st.guides.find((g) => g.id === id)!.value).toBeCloseTo(300, 3);
    expect(st.historyPast.length).toBeGreaterThanOrEqual(2);

    restoreRulersRect();
    restoreClient();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });

  it('shows hover visual feedback on guide and reverts on leave', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);
    const restoreClient = stubClientSize(rulersRoot!, { width: 800, height: 600 });

    // Create a vertical guide at x=120
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 120, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 120, clientY: 120 });
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Clear active state via a clean click on empty canvas area (to not conflate active vs hover styles)
    await act(async () => {
      dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 400, clientY: 400 });
      dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 400, clientY: 400 });
    });

    const guideEl = document.querySelector(
      '[data-rc-guide][data-rc-guide-axis="x"]',
    ) as HTMLDivElement;
    expect(guideEl).toBeTruthy();
    const lineEl = guideEl.querySelector('[data-rc-guide-line]') as HTMLDivElement;
    expect(lineEl).toBeTruthy();

    // Default (not hovered, not active) should be 1px width
    expect(lineEl.style.width).toBe('1px');

    // Hover (use pointerover which React uses under the hood for onPointerEnter)
    await act(async () => {
      dispatchPointer(guideEl, 'pointerover', { clientX: 120, clientY: 120 });
    });
    expect(lineEl.style.width).toBe('2px');

    // Leave -> back to 1px
    await act(async () => {
      dispatchPointer(guideEl, 'pointerout', { clientX: 120, clientY: 120 });
    });
    expect(lineEl.style.width).toBe('1px');

    restoreRulersRect();
    restoreClient();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });

  it('deletes the active guide with Delete and Backspace keys', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);

    // Create guide (becomes active during creation)
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 200, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 200, clientY: 120 });
    });

    let st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);

    // Press Delete on window (Rulers listens on window)
    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
      window.dispatchEvent(e);
    });
    st = useCanvasStore.getState();
    expect(st.guides.length).toBe(0);

    // Create again, then Backspace
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 180, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 180, clientY: 120 });
    });
    st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
      window.dispatchEvent(e);
    });
    st = useCanvasStore.getState();
    expect(st.guides.length).toBe(0);

    restoreRulersRect();
    restoreCanvasRect();
    await unmount();
  });

  it('undo/redo guide operations with Canvas keyboard shortcuts', async () => {
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);

    // Focus canvas to enable keyboard shortcuts
    canvas.focus();

    // Create a guide
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 150, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 150, clientY: 120 });
    });

    let st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    expect(st.historyPast.length).toBe(1);

    // Undo with Ctrl+Z
    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
      canvas.dispatchEvent(e);
    });
    st = useCanvasStore.getState();
    expect(st.guides.length).toBe(0);
    expect(st.historyPast.length).toBe(0);
    expect(st.historyFuture.length).toBe(1);

    // Redo with Shift+Ctrl+Z
    await act(async () => {
      const e = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      canvas.dispatchEvent(e);
    });
    st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    expect(st.historyPast.length).toBe(1);
    expect(st.historyFuture.length).toBe(0);

    restoreRulersRect();
    restoreCanvasRect();
    await unmount();
  });

  it('creates guides with proper data attributes for stable testing', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);
    const restoreClient = stubClientSize(rulersRoot!, { width: 800, height: 600 });

    // Create vertical guide
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 100, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 100, clientY: 120 });
    });

    // Create horizontal guide
    const top = document.querySelector('[data-rc-ruler-top]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(top, 'pointerdown', { button: 0, clientX: 50, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 200, clientY: 80 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 200, clientY: 80 });
    });

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Verify data attributes
    const xGuide = document.querySelector(
      '[data-rc-guide][data-rc-guide-axis="x"]',
    ) as HTMLDivElement;
    const yGuide = document.querySelector(
      '[data-rc-guide][data-rc-guide-axis="y"]',
    ) as HTMLDivElement;

    expect(xGuide).toBeTruthy();
    expect(yGuide).toBeTruthy();

    expect(xGuide.getAttribute('data-rc-guide')).toBe('');
    expect(xGuide.getAttribute('data-rc-guide-axis')).toBe('x');
    expect(xGuide.getAttribute('data-rc-guide-id')).toBeTruthy();

    expect(yGuide.getAttribute('data-rc-guide')).toBe('');
    expect(yGuide.getAttribute('data-rc-guide-axis')).toBe('y');
    expect(yGuide.getAttribute('data-rc-guide-id')).toBeTruthy();

    // Verify guide lines have data-rc-guide-line
    const xLine = xGuide.querySelector('[data-rc-guide-line]') as HTMLDivElement;
    const yLine = yGuide.querySelector('[data-rc-guide-line]') as HTMLDivElement;

    expect(xLine).toBeTruthy();
    expect(yLine).toBeTruthy();
    expect(xLine.getAttribute('data-rc-guide-line')).toBe('');
    expect(yLine.getAttribute('data-rc-guide-line')).toBe('');

    restoreRulersRect();
    restoreClient();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });

  it('handles guide movement history correctly with moveGuideCommit', async () => {
    const restoreGlobalClient = setGlobalClientSize({ width: 800, height: 600 });
    const { container, unmount } = await render(<TestHost />);
    const canvas = getCanvas(container);
    const rulersRoot = getRulersRoot();
    const restoreCanvasRect = stubRect(canvas);
    const restoreRulersRect = stubRect(rulersRoot!);
    const restoreClient = stubClientSize(rulersRoot!, { width: 800, height: 600 });

    // Create a vertical guide
    const left = document.querySelector('[data-rc-ruler-left]') as HTMLDivElement;
    await act(async () => {
      dispatchPointer(left, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 100, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 100, clientY: 120 });
    });

    let st = useCanvasStore.getState();
    expect(st.guides.length).toBe(1);
    const initialHistoryLength = st.historyPast.length;
    const guideId = st.guides[0].id;

    // Move the guide from x=100 to x=250
    const guideEl = document.querySelector(
      '[data-rc-guide][data-rc-guide-axis="x"]',
    ) as HTMLDivElement;
    await act(async () => {
      dispatchPointer(guideEl, 'pointerdown', { button: 0, clientX: 100, clientY: 120 });
      // Multiple temporary moves (should not create history entries)
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 150, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 200, clientY: 120 });
      dispatchPointer(rulersRoot!, 'pointermove', { clientX: 250, clientY: 120 });
    });

    // Verify temporary position
    st = useCanvasStore.getState();
    expect(st.guides.find((g) => g.id === guideId)!.value).toBeCloseTo(250, 3);
    // History should not have grown during temporary moves
    expect(st.historyPast.length).toBe(initialHistoryLength);

    // Commit the move
    await act(async () => {
      dispatchPointer(rulersRoot!, 'pointerup', { button: 0, clientX: 250, clientY: 120 });
    });

    // Now history should have one more entry for the move
    st = useCanvasStore.getState();
    expect(st.historyPast.length).toBe(initialHistoryLength + 1);
    expect(st.guides.find((g) => g.id === guideId)!.value).toBeCloseTo(250, 3);

    // Test undo - should go back to original position (100) in one step
    canvas.focus();
    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
      canvas.dispatchEvent(e);
    });

    st = useCanvasStore.getState();
    expect(st.guides.find((g) => g.id === guideId)!.value).toBeCloseTo(100, 3);

    restoreRulersRect();
    restoreClient();
    restoreCanvasRect();
    restoreGlobalClient();
    await unmount();
  });
});
